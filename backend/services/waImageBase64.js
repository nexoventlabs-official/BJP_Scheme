const axios = require('axios');

/**
 * Download an image URL → raw base64 (no data: prefix), applying an on-the-fly
 * Cloudinary transform to stay within the Flow response budget (~250 KB total).
 */
async function urlToBase64(url, opts = {}) {
  if (!url) return '';
  try {
    const fetchUrl = withCloudinaryTransform(url, opts);
    const resp = await axios.get(fetchUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024,
    });
    return Buffer.from(resp.data).toString('base64');
  } catch (err) {
    console.warn('[waImageBase64] failed for', url, err.message);
    return '';
  }
}

function withCloudinaryTransform(url, opts = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const parts = [];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop || 'fill'}`);
  parts.push(`q_${opts.quality || 70}`);
  parts.push(`f_${opts.format || 'jpg'}`);
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

module.exports = { urlToBase64, withCloudinaryTransform };
