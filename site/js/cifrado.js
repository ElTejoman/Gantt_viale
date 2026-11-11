const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function descifrar(payload, password) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const clave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: deB64(payload.salt), iterations: payload.iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(payload.iv) }, clave, deB64(payload.data));
  return JSON.parse(new TextDecoder().decode(plano));
}
