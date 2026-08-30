document.addEventListener('DOMContentLoaded', () => {
  const retainerInput = document.getElementById('retainerInput');
  const monthlyProfitEl = document.getElementById('monthlyProfit');
  const grossMarginEl = document.getElementById('grossMargin');
  const sprintCost = 1500;

  function calculateMargins() {
    const retainer = parseFloat(retainerInput.value) || 0;
    const profit = Math.max(0, retainer - sprintCost);
    const margin = retainer > 0 ? ((profit / retainer) * 100).toFixed(1) : 0;

    monthlyProfitEl.textContent = `$${profit.toLocaleString()}`;
    grossMarginEl.textContent = `${margin}%`;
  }

  retainerInput.addEventListener('input', calculateMargins);
  calculateMargins();
});
