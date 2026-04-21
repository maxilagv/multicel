const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'ddpuz7lfr';

const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = 'No se pudo subir la imagen';
    try {
      const data = await res.json();
      if (data?.error?.message) {
        message = data.error.message;
      }
    } catch {
      // ignore parse error, keep generic message
    }
    throw new Error(message);
  }

  const data = await res.json();
  const secureUrl = data.secure_url || data.url;
  if (!secureUrl) {
    throw new Error('Cloudinary no devolvió una URL válida');
  }
  return secureUrl as string;
}

