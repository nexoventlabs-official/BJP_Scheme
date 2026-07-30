const RAW_CLOUDINARY_SCHEME_IMAGES = {
  "ABHA": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409290/bjp_schemes/ABHA.png",
  "APY": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409389/bjp_schemes/APY.png",
  "Ayushman Bharat": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409392/bjp_schemes/Ayushman_Bharat.png",
  "e-Shram": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409395/bjp_schemes/e-Shram.png",
  "Jan Dhan": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409397/bjp_schemes/Jan_Dhan.png",
  "NSP Scholarship": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409399/bjp_schemes/NSP_Scholarship.png",
  "PM Awas Yojana": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409401/bjp_schemes/PM_Awas_Yojana.png",
  "PM Fasal Bima": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409404/bjp_schemes/PM_Fasal_Bima.png",
  "PM Kisan Maan Dhan": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409407/bjp_schemes/PM_Kisan_Maan_Dhan.png",
  "PM Kisan": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409410/bjp_schemes/PM_Kisan.png",
  "PM Matru Vandana": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409412/bjp_schemes/PM_Matru_Vandana.png",
  "PM Mudra Kishor": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409415/bjp_schemes/PM_Mudra_Kishor.png",
  "PM Mudra Shishu": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409417/bjp_schemes/PM_Mudra_Shishu.png",
  "PM SVANidhi": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409419/bjp_schemes/PM_SVANidhi.png",
  "PM Ujjwala": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409421/bjp_schemes/PM_Ujjwala.png",
  "PM Vishwakarma": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409423/bjp_schemes/PM_Vishwakarma.png",
  "PMJJBY": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409427/bjp_schemes/PMJJBY.png",
  "PMKVY": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409429/bjp_schemes/PMKVY.png",
  "PMSBY": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409434/bjp_schemes/PMSBY.png",
  "Stand Up India": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409435/bjp_schemes/Stand_Up_India.png",
  "Startup Seed Fund": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409437/bjp_schemes/Startup_Seed_Fund.png",
  "Sukanya Samridhi": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409441/bjp_schemes/Sukanya_Samridhi.png",
  "Udyam": "https://res.cloudinary.com/dkjrdntf/image/upload/v1785409442/bjp_schemes/Udyam.png"
};

// Helper to inject Cloudinary automatic WebP/AVIF format + quality compression + resizing
export const optimizeCloudinaryUrl = (url, width = 600) => {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
  }
  return url;
};

// Pre-optimized mapping
export const CLOUDINARY_SCHEME_IMAGES = Object.entries(RAW_CLOUDINARY_SCHEME_IMAGES).reduce((acc, [key, val]) => {
  acc[key] = optimizeCloudinaryUrl(val, 600);
  return acc;
}, {});

// Immediate in-memory image preloading queue for instant zero-latency loading
if (typeof window !== 'undefined') {
  const preloaded = new Set();
  Object.values(CLOUDINARY_SCHEME_IMAGES).forEach(url => {
    if (!preloaded.has(url)) {
      preloaded.add(url);
      const img = new Image();
      img.src = url;
    }
  });
}
