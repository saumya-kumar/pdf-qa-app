import type { Buffer } from 'node:buffer';

export class PdfService {
  static async processPdfBuffer(buffer: Buffer, filename?: string): Promise<string> {
    try {
      // Validate buffer first
      if (!buffer || buffer.length === 0) {
        throw new Error('Invalid or empty PDF buffer provided');
      }

      // Ensure buffer starts with PDF signature
      if (buffer.slice(0, 4).toString() !== '%PDF') {
        throw new Error('Buffer does not contain valid PDF data');
      }

      console.log(`Processing PDF buffer of ${buffer.length} bytes for file: ${filename || 'unknown'}`);
      
      // Use pdf-lib which is Node.js compatible
      const { PDFDocument } = await import('pdf-lib');
      
      // Load the PDF document from buffer
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = pdfDoc.getPages();
      
      let fullText = '';
      
      // Extract text from each page (Note: pdf-lib has limited text extraction)
      // For better text extraction, we'll need to fallback to a simpler approach
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        // pdf-lib doesn't have built-in text extraction
        // We'll extract basic content or use a workaround
        fullText += `[Page ${i + 1} content - ${page.getWidth()}x${page.getHeight()}]\n`;
      }
      
      // If pdf-lib doesn't extract text well, let's try a basic approach
      // Convert buffer to string and extract readable text
      const bufferString = buffer.toString('latin1');
      const textMatches = bufferString.match(/\((.*?)\)/g);
      
      if (textMatches && textMatches.length > 0) {
        const extractedText = textMatches
          .map(match => match.slice(1, -1)) // Remove parentheses
          .filter(text => text.length > 2 && /[a-zA-Z]/.test(text)) // Filter meaningful text
          .join(' ');
        
        if (extractedText.length > 50) {
          fullText = extractedText;
        }
      }
      
      // Fallback: extract any readable ASCII text from buffer
      if (!fullText || fullText.length < 20) {
        const asciiText = buffer.toString('ascii').replace(/[^\x20-\x7E\n\r]/g, ' ');
        const words = asciiText.split(/\s+/).filter(word => 
          word.length > 2 && /^[a-zA-Z0-9\.,!?]+$/.test(word)
        );
        
        if (words.length > 10) {
          fullText = words.join(' ');
        }
      }
      
      const text = fullText.trim();
      if (!text || text.length < 10) {
        throw new Error('No extractable text found. This might be a scanned PDF or image-based content.');
      }
      
      console.log(`Successfully extracted ${text.length} characters from PDF`);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`PDF processing failed for ${filename || 'unknown file'}:`, msg);
      throw new Error(`Failed to extract text from PDF${filename ? ` ${filename}` : ''}: ${msg}`);
    }
  }
}

/**
 * Validate that a file is a PDF
 */
export function validatePdfFile(file: File): void {
  if (file.type !== 'application/pdf') {
    throw new Error(`Invalid file type: ${file.type}. Only PDF files are supported.`);
  }

  // 20MB limit
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`File too large: ${file.size} bytes. Maximum size is ${maxSize} bytes (20MB).`);
  }

  if (file.size === 0) {
    throw new Error('File is empty.');
  }
}
