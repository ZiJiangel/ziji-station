import { supabase } from './supabase';

/**
 * 通用图片上传函数
 * 目前使用 Supabase Storage，未来接入 Tigris 只需改这里的 endpoint
 */
export async function uploadImage(file: File): Promise<string> {
  // 简单校验
  if (!file.type.startsWith('image/')) throw new Error('只能上传图片');
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB');

  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  const { data, error } = await supabase.storage
    .from('images')
    .upload(filePath, file);

  if (error) throw new Error('上传失败: ' + error.message);

  const { data: { publicUrl } } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return publicUrl;
}
