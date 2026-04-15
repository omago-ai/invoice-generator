// ========================================
// Invoice Generator — PDF Export
// ========================================

export async function generatePDF(element, filename) {
  // Temporarily expand the preview to full A4 size for capture
  const previewFrame = element.closest('.preview-frame');
  const originalStyles = {
    width: element.style.width,
    height: element.style.height,
    transform: element.style.transform,
    position: element.style.position,
  };

  // Set to exact A4 pixel dimensions at 96 DPI
  // A4 = 210mm × 297mm ≈ 794px × 1123px at 96 DPI
  const a4Width = 794;
  const a4Height = 1123;

  // Create an off-screen clone for rendering
  const clone = element.cloneNode(true);
  clone.style.width = a4Width + 'px';
  clone.style.minHeight = a4Height + 'px';
  clone.style.padding = '48px 44px';
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.background = '#fff';
  clone.style.fontSize = '13px';
  document.body.appendChild(clone);

  // Copy computed CSS custom properties to clone
  const accent = getComputedStyle(element).getPropertyValue('--inv-accent').trim();
  if (accent) {
    clone.style.setProperty('--inv-accent', accent);
    clone.style.setProperty('--inv-accent-light', accent + '10');
    clone.style.setProperty('--inv-accent-border', accent + '33');
  }

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: a4Width,
      windowWidth: a4Width,
    });

    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = 210; // mm
    const pdfHeight = 297; // mm

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(filename);
  } finally {
    document.body.removeChild(clone);
  }
}
