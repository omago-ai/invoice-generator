// ========================================
// Invoice Generator — App Logic
// ========================================

import { generatePDF } from './pdf.js';

// --- Currency map ---
const CURRENCIES = {
  USD: '$', EUR: '€', GBP: '£', HKD: 'HK$', CAD: 'CA$',
  AUD: 'A$', JPY: '¥', SGD: 'S$', CNY: '¥', KRW: '₩',
  TWD: 'NT$', CHF: 'CHF', NZD: 'NZ$'
};

// --- State ---
let logoDataUrl = null;
let lineItems = [{ description: '', qty: 1, rate: 0 }];

// --- DOM refs ---
const $ = (id) => document.getElementById(id);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  renderLineItems();
  updatePreview();
  bindEvents();
});

function setDefaultDates() {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  $('invoiceDate').value = formatDate(today);
  $('dueDate').value = formatDate(due);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Events ---
function bindEvents() {
  // All form inputs trigger preview update
  const formPanel = document.querySelector('.form-panel');
  formPanel.addEventListener('input', updatePreview);
  formPanel.addEventListener('change', updatePreview);

  // Logo upload
  $('logoUpload').addEventListener('click', () => $('logoInput').click());
  $('logoInput').addEventListener('change', handleLogoUpload);
  $('logoRemove').addEventListener('click', handleLogoRemove);

  // Accent color hex display
  $('accentColor').addEventListener('input', (e) => {
    $('colorHex').textContent = e.target.value;
  });

  // Line items
  $('addLineItem').addEventListener('click', addLineItem);

  // Advanced toggle
  $('advancedToggle').addEventListener('click', toggleAdvanced);

  // Payment terms custom field
  $('paymentTerms').addEventListener('change', (e) => {
    const customField = $('customTermsField');
    customField.hidden = e.target.value !== 'custom';
  });

  // Discount type toggle
  $('discountType').addEventListener('change', (e) => {
    $('discountValue').hidden = e.target.value === 'none';
    updatePreview();
  });

  // Download PDF
  $('downloadPdf').addEventListener('click', handleDownload);

  // Drag and drop for logo
  const logoArea = $('logoUpload');
  logoArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    logoArea.style.borderColor = 'var(--accent)';
    logoArea.style.background = 'var(--accent-light)';
  });
  logoArea.addEventListener('dragleave', () => {
    logoArea.style.borderColor = '';
    logoArea.style.background = '';
  });
  logoArea.addEventListener('drop', (e) => {
    e.preventDefault();
    logoArea.style.borderColor = '';
    logoArea.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.match(/image\/(png|jpeg|svg\+xml)/)) {
      processLogoFile(file);
    }
  });
}

// --- Logo ---
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (file) processLogoFile(file);
}

function processLogoFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    logoDataUrl = e.target.result;
    $('logoPlaceholder').hidden = true;
    $('logoPreviewThumb').src = logoDataUrl;
    $('logoPreviewThumb').hidden = false;
    $('logoRemove').hidden = false;
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function handleLogoRemove(e) {
  e.stopPropagation();
  logoDataUrl = null;
  $('logoInput').value = '';
  $('logoPlaceholder').hidden = false;
  $('logoPreviewThumb').hidden = true;
  $('logoRemove').hidden = true;
  updatePreview();
}

// --- Line Items ---
function renderLineItems() {
  const container = $('lineItems');
  container.innerHTML = '';
  lineItems.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.innerHTML = `
      <input type="text" data-index="${i}" data-field="description" value="${escapeHtml(item.description)}" placeholder="Service or product description">
      <input type="number" data-index="${i}" data-field="qty" value="${item.qty}" min="0" step="1">
      <input type="number" data-index="${i}" data-field="rate" value="${item.rate}" min="0" step="0.01">
      <span class="line-item-amount" data-index="${i}">${formatMoney(item.qty * item.rate)}</span>
      <button type="button" class="btn-remove-line" data-index="${i}" title="Remove">&times;</button>
    `;
    container.appendChild(row);
  });

  // Bind line item events
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', handleLineItemChange);
  });
  container.querySelectorAll('.btn-remove-line').forEach((btn) => {
    btn.addEventListener('click', handleRemoveLineItem);
  });
}

function handleLineItemChange(e) {
  const i = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (field === 'description') {
    lineItems[i].description = e.target.value;
  } else {
    lineItems[i][field] = parseFloat(e.target.value) || 0;
  }
  // Update this row's amount display
  const amount = lineItems[i].qty * lineItems[i].rate;
  document.querySelector(`.line-item-amount[data-index="${i}"]`).textContent = formatMoney(amount);
  updatePreview();
}

function handleRemoveLineItem(e) {
  const i = parseInt(e.target.dataset.index);
  if (lineItems.length > 1) {
    lineItems.splice(i, 1);
    renderLineItems();
    updatePreview();
  }
}

function addLineItem() {
  lineItems.push({ description: '', qty: 1, rate: 0 });
  renderLineItems();
  updatePreview();
}

// --- Advanced Toggle ---
function toggleAdvanced() {
  const fields = $('advancedFields');
  const arrow = $('advancedArrow');
  fields.hidden = !fields.hidden;
  arrow.classList.toggle('open');
}

// --- Calculations ---
function getSubtotal() {
  return lineItems.reduce((sum, item) => sum + (item.qty * item.rate), 0);
}

function getDiscount(subtotal) {
  const type = $('discountType').value;
  const value = parseFloat($('discountValue').value) || 0;
  if (type === 'percent') return subtotal * (value / 100);
  if (type === 'flat') return value;
  return 0;
}

function getTax(amountAfterDiscount) {
  const rate = parseFloat($('taxRate').value) || 0;
  return amountAfterDiscount * (rate / 100);
}

// --- Preview ---
function updatePreview() {
  const accent = $('accentColor').value;
  const currencyCode = $('currency').value;
  const symbol = CURRENCIES[currencyCode] || '$';

  const subtotal = getSubtotal();
  const discount = getDiscount(subtotal);
  const afterDiscount = subtotal - discount;
  const tax = getTax(afterDiscount);
  const total = afterDiscount + tax;

  const preview = $('invoicePreview');
  preview.style.setProperty('--inv-accent', accent);
  preview.style.setProperty('--inv-accent-light', accent + '10');
  preview.style.setProperty('--inv-accent-border', accent + '33');

  // Build line items HTML
  const lineItemsHtml = lineItems
    .filter(item => item.description || item.rate > 0)
    .map(item => `
      <tr>
        <td>${escapeHtml(item.description) || '—'}</td>
        <td>${item.qty}</td>
        <td>${symbol}${formatNumber(item.rate)}</td>
        <td>${symbol}${formatNumber(item.qty * item.rate)}</td>
      </tr>
    `).join('');

  // Build totals rows
  let totalsHtml = `
    <div class="inv-totals-row">
      <span class="inv-totals-label">Subtotal</span>
      <span>${symbol}${formatNumber(subtotal)}</span>
    </div>`;

  if (discount > 0) {
    const discountLabel = $('discountType').value === 'percent'
      ? `Discount (${$('discountValue').value}%)`
      : 'Discount';
    totalsHtml += `
    <div class="inv-totals-row">
      <span class="inv-totals-label">${discountLabel}</span>
      <span>-${symbol}${formatNumber(discount)}</span>
    </div>`;
  }

  const taxRate = parseFloat($('taxRate').value) || 0;
  if (taxRate > 0) {
    totalsHtml += `
    <div class="inv-totals-row">
      <span class="inv-totals-label">Tax (${taxRate}%)</span>
      <span>${symbol}${formatNumber(tax)}</span>
    </div>`;
  }

  totalsHtml += `
    <div class="inv-totals-row total">
      <span class="inv-totals-label">Total</span>
      <span>${symbol}${formatNumber(total)}</span>
    </div>`;

  // Build advanced meta (only when advanced section is open)
  let advancedMetaHtml = '';
  const advancedOpen = !$('advancedFields').hidden;
  const taxId = advancedOpen ? $('taxId')?.value : '';
  const poNumber = advancedOpen ? $('poNumber')?.value : '';
  const paymentTerms = advancedOpen ? $('paymentTerms')?.value : '';
  const customTerms = advancedOpen ? $('customTerms')?.value : '';

  const advancedItems = [];
  if (taxId) advancedItems.push({ label: 'Tax ID', value: escapeHtml(taxId) });
  if (poNumber) advancedItems.push({ label: 'PO Number', value: escapeHtml(poNumber) });
  if (paymentTerms && paymentTerms !== '') {
    const termsDisplay = paymentTerms === 'custom' ? escapeHtml(customTerms) : paymentTerms.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
    advancedItems.push({ label: 'Payment Terms', value: termsDisplay });
  }

  if (advancedItems.length > 0) {
    advancedMetaHtml = `<div class="inv-advanced-meta">
      ${advancedItems.map(item => `
        <div class="inv-advanced-item">
          <div class="inv-meta-label">${item.label}</div>
          <div class="inv-meta-value">${item.value}</div>
        </div>
      `).join('')}
    </div>`;
  }

  // Notes
  const notes = $('notes').value;
  const notesHtml = notes ? `
    <div class="inv-notes">
      <div class="inv-notes-label">Notes</div>
      <div class="inv-notes-text">${escapeHtml(notes)}</div>
    </div>` : '';

  // Full preview
  preview.innerHTML = `
    <div class="inv-header">
      <div class="inv-logo">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo">` : ''}
      </div>
      <div class="inv-title">INVOICE</div>
    </div>

    <div class="inv-parties">
      <div class="inv-party">
        <div class="inv-party-label">From</div>
        <div class="inv-party-name">${escapeHtml($('fromName').value) || '<span style="color:#ccc">Your Company</span>'}</div>
        <div class="inv-party-detail">${escapeHtml($('fromAddress').value) || ''}</div>
        <div class="inv-party-detail">${escapeHtml($('fromEmail').value) || ''}</div>
      </div>
      <div class="inv-party">
        <div class="inv-party-label">Bill To</div>
        <div class="inv-party-name">${escapeHtml($('toName').value) || '<span style="color:#ccc">Client Name</span>'}</div>
        <div class="inv-party-detail">${escapeHtml($('toAddress').value) || ''}</div>
        <div class="inv-party-detail">${escapeHtml($('toEmail').value) || ''}</div>
      </div>
    </div>

    <div class="inv-meta">
      <div class="inv-meta-item">
        <div class="inv-meta-label">Invoice No.</div>
        <div class="inv-meta-value">${escapeHtml($('invoiceNumber').value)}</div>
      </div>
      <div class="inv-meta-item">
        <div class="inv-meta-label">Date</div>
        <div class="inv-meta-value">${formatDisplayDate($('invoiceDate').value)}</div>
      </div>
      <div class="inv-meta-item">
        <div class="inv-meta-label">Due Date</div>
        <div class="inv-meta-value">${formatDisplayDate($('dueDate').value)}</div>
      </div>
    </div>

    ${advancedMetaHtml}

    <table class="inv-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px;">No line items</td></tr>'}
      </tbody>
    </table>

    <div class="inv-totals">
      <div class="inv-totals-table">
        ${totalsHtml}
      </div>
    </div>

    ${notesHtml}

    <div class="inv-footer">Powered by <a href="https://omago.ai" target="_blank" style="color:var(--inv-text-tertiary);text-decoration:none;font-weight:500;">omago.ai</a></div>
  `;
}

// --- Helpers ---
function formatMoney(n) {
  return formatNumber(n);
}

function formatNumber(n) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- PDF Download ---
async function handleDownload() {
  const btn = $('downloadPdf');
  const originalText = btn.textContent;
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    const invoiceNumber = $('invoiceNumber').value || 'invoice';
    const filename = `${invoiceNumber.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.pdf`;
    await generatePDF($('invoicePreview'), filename);
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
