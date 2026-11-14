"""Extract faithful portrait poster frames from EG Studio's own edited sample videos.

Run in GitHub Actions on a review branch. Outputs are committed only to that branch.
"""
from __future__ import annotations

import json
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps, ImageStat, ImageFilter

SAMPLES = ["sample-process", "sample-panel", "sample-saas-founder"]
ROOT = Path("assets/samples")
REVIEW = Path("qa-artifacts/poster-candidates")
REVIEW.mkdir(parents=True, exist_ok=True)
FRACS = (0.08, 0.14, 0.22, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.88)
results = []


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def get_duration(path: Path) -> float:
    duration = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)]))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"No playable duration: {path}")
    return duration


def frame_at(path: Path, time: float, dest: Path) -> bool:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{time:.3f}", "-i", str(path),
        "-frames:v", "1", "-vf", "scale=720:-2", str(dest)
    ], text=True, capture_output=True)
    return result.returncode == 0 and dest.exists() and dest.stat().st_size > 1000


def fit_frame(path: Path) -> Image.Image:
    with Image.open(path) as image:
        source = image.convert("RGB")
        return ImageOps.fit(source, (720, 1280), method=Image.Resampling.LANCZOS, centering=(.5, .47))


def frame_score(image: Image.Image) -> tuple[float, dict]:
    thumb = image.resize((180,320),Image.Resampling.BILINEAR)
    gray = thumb.convert("L")
    st = ImageStat.Stat(gray)
    mean, variance = st.mean[0], st.var[0]
    # Penalize mostly black frames and avoid picking an empty title slate.
    hist = gray.histogram()
    total = sum(hist)
    dark_ratio = sum(hist[:38])/total
    brighter_ratio = sum(hist[80:])/total
    edge = ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).mean[0]
    entropy = gray.entropy()
    score = (
        (1-dark_ratio)*52
        + brighter_ratio*24
        + min(variance/1500,3)*10
        + min(edge/18,2)*12
        + entropy*7
        - dark_ratio*52
    )
    return score, dict(mean=round(mean,2),darkRatio=round(dark_ratio,3),brighterRatio=round(brighter_ratio,3),variance=round(variance,1),edge=round(edge,1),entropy=round(entropy,2))


def create_contact_sheet(frames: list[tuple[float,Image.Image,dict]], sample: str):
    import PIL.ImageDraw as D
    w,h=180,355
    board=Image.new("RGB",(5*w,2*h),"#101A2C")
    draw=D.Draw(board)
    for idx,(timestamp,img,measure) in enumerate(frames[:10]):
        x,y=(idx%5)*w,(idx//5)*h
        small=img.resize((180,320),Image.Resampling.LANCZOS)
        board.paste(small,(x,y))
        draw.text((x+7,y+326),f"{timestamp:.1f}s   {measure['score']:.0f}",fill="#FFFFFF")
    board.save(REVIEW / f"{sample}-candidates.jpg",quality=85)


for sample in SAMPLES:
    video=ROOT/f"{sample}.mp4"
    if not video.exists():
        raise FileNotFoundError(video)
    duration=get_duration(video)
    candidates=[]
    with tempfile.TemporaryDirectory(prefix="egposter_") as temp:
        for i,fraction in enumerate(FRACS):
            t=min(max(.15,duration*fraction),duration-.15)
            frame=Path(temp)/f"frame_{i}.png"
            if not frame_at(video,t,frame):
                continue
            poster=fit_frame(frame)
            score,metric=frame_score(poster)
            candidates.append((t,poster,dict(score=score,**metric)))
        if not candidates:
            raise RuntimeError(f"No decodable frames in {video}")
        create_contact_sheet(candidates,sample)
        # Favor a rich, readable real video frame rather than a near-black slate.
        selected=max(candidates,key=lambda item: item[2]["score"])
        output=ROOT/f"{sample}-thumb.jpg"
        selected[1].save(output,format="JPEG",quality=87,optimize=True,subsampling=0)
        if output.stat().st_size < 12000:
            raise ValueError(f"Suspiciously empty thumbnail {output}")
        results.append(dict(sample=sample,duration=duration,selectedTimestamp=round(selected[0],2),
                            score=round(selected[2]["score"],2),metrics=selected[2],
                            destination=str(output),bytes=output.stat().st_size))
print(json.dumps(results,indent=2))
(REVIEW/"selection.json").write_text(json.dumps(results,indent=2),encoding="utf-8")
