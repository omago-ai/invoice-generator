// ========================================
// Invoice Generator — App Logic
// ========================================

import { generatePDF } from './pdf.js';

// --- Locale (set by each language's index.html) ---
const L = window.LOCALE || {};

// --- Currency map ---
const CURRENCIES = {
  USD: '$', EUR: '€', GBP: '£', HKD: 'HK$', CAD: 'CA$',
  AUD: 'A$', JPY: '¥', SGD: 'S$', CNY: '¥', KRW: '₩',
  TWD: 'NT$', CHF: 'CHF', NZD: 'NZ$', MXN: '$', COP: '$',
  THB: '฿', VND: '₫', BRL: 'R$', PHP: '₱', IDR: 'Rp',
  MYR: 'RM', INR: '₹', ARS: '$', CLP: '$', PEN: 'S/'
};

// Currencies with no decimal places
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP']);

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

  // Set cookie when user clicks a lang-switcher link so geo-redirect doesn't override their choice
  document.querySelectorAll('.lang-switcher a').forEach(a => {
    a.addEventListener('click', () => {
      document.cookie = 'lang_chosen=1; path=/; max-age=86400; SameSite=Lax';
    });
  });
});

function setDefaultDates() {
  const today = new Date();
  $('invoiceDate').value = formatDate(today);
  // Due Date is driven by the default Payment Terms value (Net 30) via applyDueDateFromTerm().
  applyDueDateFromTerm();
}

// --- Payment terms → due date ---
let isProgrammaticDateWrite = false;

function computeDueDate(invoiceDateStr, term) {
  if (!invoiceDateStr) return null;
  const d = new Date(invoiceDateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  switch (term) {
    case 'due-receipt':
      return formatDate(d);
    case 'net-15':
      d.setDate(d.getDate() + 15);
      return formatDate(d);
    case 'net-30':
      d.setDate(d.getDate() + 30);
      return formatDate(d);
    case 'net-45':
      d.setDate(d.getDate() + 45);
      return formatDate(d);
    case 'net-60':
      d.setDate(d.getDate() + 60);
      return formatDate(d);
    default:
      return null;
  }
}

function applyDueDateFromTerm() {
  const invoiceDate = $('invoiceDate').value;
  const term = $('paymentTerms').value;
  const newDue = computeDueDate(invoiceDate, term);
  if (newDue === null) return;
  isProgrammaticDateWrite = true;
  $('dueDate').value = newDue;
  isProgrammaticDateWrite = false;
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
  const locale = L.dateLocale || 'en-US';

  // Thai Buddhist year
  if (L.buddhistYear) {
    const day = d.getDate();
    const month = d.toLocaleDateString('th-TH', { month: 'short' });
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  }

  // Japanese format
  if (locale === 'ja-JP') {
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Korean format
  if (locale === 'ko-KR') {
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Chinese format
  if (locale === 'zh-TW' || locale === 'zh-HK') {
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Number formatting ---
function formatNumber(n) {
  const currencyCode = $('currency').value;
  const decimals = ZERO_DECIMAL.has(currencyCode) ? 0 : 2;
  const sep = L.thousandSep || ',';
  const dec = L.decimalSep || '.';

  const fixed = n.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return decPart !== undefined ? withSep + dec + decPart : withSep;
}

function formatMoney(n) {
  return formatNumber(n);
}

// --- Events ---
function bindEvents() {
  // All form inputs trigger preview update
  const formPanel = document.querySelector('.form-panel');
  formPanel.addEventListener('input', updatePreview);
  formPanel.addEventListener('change', updatePreview);

  // Logo upload — only trigger file picker when clicking the placeholder
  $('logoPlaceholder').addEventListener('click', () => {
    $('logoInput').click();
  });
  $('logoInput').addEventListener('change', handleLogoUpload);
  $('logoRemove').addEventListener('click', (e) => {
    e.stopPropagation();
    handleLogoRemove();
  });

  // Font picker
  document.querySelectorAll('.font-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      updatePreview();
    });
  });

  // Logo size slider
  $('logoSize').addEventListener('input', (e) => {
    e.stopPropagation();
    const size = e.target.value;
    $('logoPreviewThumb').style.maxWidth = size + 'px';
    updatePreview();
  });

  // Color picker dropdown toggle
  $('colorPickerTrigger').addEventListener('click', () => {
    const dd = $('colorDropdown');
    dd.hidden = !dd.hidden;
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!$('colorPicker').contains(e.target)) {
      $('colorDropdown').hidden = true;
    }
  });

  // Swatch selection
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      setAccentColor(swatch.dataset.color);
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // Hex input
  $('colorHexInput').addEventListener('input', (e) => {
    let val = e.target.value.replace(/[^0-9a-fA-F]/g, '');
    e.target.value = val;
    if (val.length === 6) {
      setAccentColor('#' + val);
      document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color.toLowerCase() === '#' + val.toLowerCase());
      });
    }
  });

  function setAccentColor(color) {
    $('accentColor').value = color;
    $('colorHex').textContent = color;
    $('colorPreview').style.background = color;
    $('colorHexInput').value = color.replace('#', '');
    $('colorHexPreview').style.background = color;
    updatePreview();
  }

  // Line items
  $('addLineItem').addEventListener('click', addLineItem);

  // Advanced toggle
  $('advancedToggle').addEventListener('click', toggleAdvanced);

  // Payment terms: toggle custom field + auto-fill due date
  $('paymentTerms').addEventListener('change', (e) => {
    const customField = $('customTermsField');
    customField.hidden = e.target.value !== 'custom';
    applyDueDateFromTerm();
  });

  // Invoice date change → recompute due date if term is computable.
  // Use both 'input' and 'change' — date pickers vary in which they fire.
  $('invoiceDate').addEventListener('input', applyDueDateFromTerm);
  $('invoiceDate').addEventListener('change', applyDueDateFromTerm);

  // Due date manual edit → switch term to Custom (override behavior).
  const handleDueDateEdit = () => {
    if (isProgrammaticDateWrite) return;
    const termSelect = $('paymentTerms');
    if (termSelect.value !== 'custom') {
      termSelect.value = 'custom';
      $('customTermsField').hidden = false;
    }
  };
  $('dueDate').addEventListener('input', handleDueDateEdit);
  $('dueDate').addEventListener('change', handleDueDateEdit);

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
    $('logoUploaded').hidden = false;
    $('logoPreviewThumb').src = logoDataUrl;
    $('logoUpload').classList.add('has-logo');
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function handleLogoRemove() {
  logoDataUrl = null;
  $('logoInput').value = '';
  $('logoSize').value = 140;
  $('logoPreviewThumb').style.maxWidth = '';
  $('logoPlaceholder').hidden = false;
  $('logoUploaded').hidden = true;
  $('logoUpload').classList.remove('has-logo');
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
      <input type="text" data-index="${i}" data-field="description" value="${escapeHtml(item.description)}" placeholder="${L.lineItemPlaceholder || 'Service or product description'}">
      <input type="number" data-index="${i}" data-field="qty" value="${item.qty}" min="0" step="1">
      <input type="number" data-index="${i}" data-field="rate" value="${item.rate}" min="0" step="0.01">
      <span class="line-item-amount" data-index="${i}">${formatMoney(item.qty * item.rate)}</span>
      <button type="button" class="btn-remove-line" data-index="${i}" title="${L.remove || 'Remove'}">&times;</button>
    `;
    container.appendChild(row);
  });

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

  const selectedFont = document.querySelector('.font-option.active input').value;
  const fontStack = selectedFont + ", -apple-system, sans-serif";

  const preview = $('invoicePreview');
  preview.style.fontFamily = fontStack;
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
      <span class="inv-totals-label">${L.subtotal || 'Subtotal'}</span>
      <span>${symbol}${formatNumber(subtotal)}</span>
    </div>`;

  if (discount > 0) {
    const discountWord = L.discount || 'Discount';
    const discountLabel = $('discountType').value === 'percent'
      ? `${discountWord} (${$('discountValue').value}%)`
      : discountWord;
    const afterDiscountLabel = L.subtotalAfterDiscount || 'Subtotal after discount';
    totalsHtml += `
    <div class="inv-totals-row">
      <span class="inv-totals-label">${discountLabel}</span>
      <span>-${symbol}${formatNumber(discount)}</span>
    </div>
    <div class="inv-totals-row">
      <span class="inv-totals-label">${afterDiscountLabel}</span>
      <span>${symbol}${formatNumber(afterDiscount)}</span>
    </div>`;
  }

  const taxRate = parseFloat($('taxRate').value) || 0;
  if (taxRate > 0) {
    totalsHtml += `
    <div class="inv-totals-row">
      <span class="inv-totals-label">${L.taxName || 'Tax'} (${taxRate}%)</span>
      <span>${symbol}${formatNumber(tax)}</span>
    </div>`;
  }

  totalsHtml += `
    <div class="inv-totals-row total">
      <span class="inv-totals-label">${L.total || 'Total'}</span>
      <span>${symbol}${formatNumber(total)}</span>
    </div>`;

  // Build advanced meta
  let advancedMetaHtml = '';
  const advancedOpen = !$('advancedFields').hidden;
  const taxId = advancedOpen ? $('taxId')?.value : '';
  const poNumber = advancedOpen ? $('poNumber')?.value : '';
  const paymentTerms = advancedOpen ? $('paymentTerms')?.value : '';
  const customTerms = advancedOpen ? $('customTerms')?.value : '';

  const advancedItems = [];
  if (taxId) advancedItems.push({ label: L.taxIdLabel || 'Tax ID', value: escapeHtml(taxId) });
  if (poNumber) advancedItems.push({ label: L.poNumber || 'PO Number', value: escapeHtml(poNumber) });
  if (paymentTerms && paymentTerms !== '') {
    const termsDisplay = paymentTerms === 'custom' ? escapeHtml(customTerms) : paymentTerms.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
    advancedItems.push({ label: L.paymentTermsLabel || 'Payment Terms', value: termsDisplay });
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
      <div class="inv-notes-label">${L.notes || 'Notes'}</div>
      <div class="inv-notes-text">${escapeHtml(notes)}</div>
    </div>` : '';

  // Full preview
  preview.innerHTML = `
    <div class="inv-header">
      <div class="inv-logo">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" style="max-width:${$('logoSize').value}px">` : ''}
      </div>
      <div class="inv-title">${L.invoiceTitle || 'INVOICE'}</div>
    </div>

    <div class="inv-parties">
      <div class="inv-party">
        <div class="inv-party-label">${L.from || 'From'}</div>
        <div class="inv-party-name">${escapeHtml($('fromName').value) || '<span style="color:#ccc">' + (L.yourCompany || 'Your Company') + '</span>'}</div>
        <div class="inv-party-detail">${escapeHtml($('fromAddress').value) || ''}</div>
        <div class="inv-party-detail">${escapeHtml($('fromEmail').value) || ''}</div>
      </div>
      <div class="inv-party">
        <div class="inv-party-label">${L.billTo || 'Bill To'}</div>
        <div class="inv-party-name">${escapeHtml($('toName').value) || '<span style="color:#ccc">' + (L.clientName || 'Client Name') + '</span>'}</div>
        <div class="inv-party-detail">${escapeHtml($('toAddress').value) || ''}</div>
        <div class="inv-party-detail">${escapeHtml($('toEmail').value) || ''}</div>
      </div>
    </div>

    <div class="inv-meta">
      <div class="inv-meta-item">
        <div class="inv-meta-label">${L.invoiceNo || 'Invoice No.'}</div>
        <div class="inv-meta-value">${escapeHtml($('invoiceNumber').value)}</div>
      </div>
      <div class="inv-meta-item">
        <div class="inv-meta-label">${L.date || 'Date'}</div>
        <div class="inv-meta-value">${formatDisplayDate($('invoiceDate').value)}</div>
      </div>
      <div class="inv-meta-item">
        <div class="inv-meta-label">${L.dueDate || 'Due Date'}</div>
        <div class="inv-meta-value">${formatDisplayDate($('dueDate').value)}</div>
      </div>
    </div>

    ${advancedMetaHtml}

    <table class="inv-table">
      <thead>
        <tr>
          <th>${L.description || 'Description'}</th>
          <th>${L.qty || 'Qty'}</th>
          <th>${L.rate || 'Rate'}</th>
          <th>${L.amount || 'Amount'}</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px;">' + (L.noLineItems || 'No line items') + '</td></tr>'}
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
  btn.textContent = L.generating || 'Generating...';
  btn.disabled = true;

  try {
    const invoiceNumber = $('invoiceNumber').value || 'invoice';
    const filename = `${invoiceNumber.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.pdf`;
    await generatePDF($('invoicePreview'), filename);
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert(L.pdfError || 'Failed to generate PDF. Please try again.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
