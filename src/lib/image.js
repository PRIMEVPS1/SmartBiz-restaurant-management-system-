// src/lib/image.js — resize + upload images to Supabase Storage
import { supabase } from './supabase'

export async function resizeToBlob(file, max = 800, type = 'image/jpeg', quality = 0.85) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise(r => c.toBlob(r, type, quality))
}

// returns public URL
export async function uploadImage(bucket, folder, file, { max = 800, type = 'image/jpeg', ext = 'jpg' } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image')
  const blob = await resizeToBlob(file, max, type)
  const path = `${folder}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type, upsert: true })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
