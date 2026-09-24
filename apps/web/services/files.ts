// Utilitários para enviar e baixar arquivos pela API (que trafega JSON com conteúdo em base64).

export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadBase64(fileName: string, mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
