// Local scheme images map served directly from public/schemes/
const LOCAL_SCHEME_IMAGES = {
  1: "/schemes/PMSBY.png",
  2: "/schemes/PMJJBY.png",
  3: "/schemes/APY.png",
  4: "/schemes/PM SVANidhi.png",
  5: "/schemes/PM Mudra Shishu.png",
  6: "/schemes/PM Mudra Kishor.png",
  7: "/schemes/Udyam.png",
  8: "/schemes/Stand Up India.png",
  9: "/schemes/Startup Seed Fund.png",
  10: "/schemes/PM Kisan.png",
  11: "/schemes/PM Fasal Bima.png",
  12: "/schemes/PM Kisan Maan Dhan.png",
  13: "/schemes/Ayushman Bharat.png",
  14: "/schemes/ABHA.png",
  15: "/schemes/PM Ujjwala.png",
  16: "/schemes/PM Matru Vandana.png",
  17: "/schemes/Sukanya Samridhi.png",
  18: "/schemes/PM Awas Yojana.png",
  19: "/schemes/PMKVY.png",
  20: "/schemes/NSP Scholarship.png",
  21: "/schemes/PM Vishwakarma.png",
  22: "/schemes/Jan Dhan.png",
  23: "/schemes/e-Shram.png"
};

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

export const optimizeCloudinaryUrl = (url) => url;

export const CLOUDINARY_SCHEME_IMAGES = RAW_CLOUDINARY_SCHEME_IMAGES;

const SCHEME_ID_TO_IMAGE_KEY = {
  1: "PMSBY",
  2: "PMJJBY",
  3: "APY",
  4: "PM SVANidhi",
  5: "PM Mudra Shishu",
  6: "PM Mudra Kishor",
  7: "Udyam",
  8: "Stand Up India",
  9: "Startup Seed Fund",
  10: "PM Kisan",
  11: "PM Fasal Bima",
  12: "PM Kisan Maan Dhan",
  13: "Ayushman Bharat",
  14: "ABHA",
  15: "PM Ujjwala",
  16: "PM Matru Vandana",
  17: "Sukanya Samridhi",
  18: "PM Awas Yojana",
  19: "PMKVY",
  20: "NSP Scholarship",
  21: "PM Vishwakarma",
  22: "Jan Dhan",
  23: "e-Shram"
};

export const getSchemeBgImage = (schemeObjOrTitle, optionalId) => {
  let id = optionalId || null;

  if (!id && schemeObjOrTitle && typeof schemeObjOrTitle === 'object') {
    id = schemeObjOrTitle.id;
    if (!id && schemeObjOrTitle.title) {
      const match = String(schemeObjOrTitle.title).match(/^(\d+)\./);
      if (match) id = Number(match[1]);
    }
  }
  
  if (!id && typeof schemeObjOrTitle === 'number') {
    id = schemeObjOrTitle;
  }

  if (!id && typeof schemeObjOrTitle === 'string') {
    const match = schemeObjOrTitle.match(/^(\d+)\./);
    if (match) id = Number(match[1]);
  }

  const num = Number(id);
  if (num && LOCAL_SCHEME_IMAGES[num]) {
    return LOCAL_SCHEME_IMAGES[num];
  }

  if (num && SCHEME_ID_TO_IMAGE_KEY[num]) {
    const key = SCHEME_ID_TO_IMAGE_KEY[num];
    if (CLOUDINARY_SCHEME_IMAGES[key]) return CLOUDINARY_SCHEME_IMAGES[key];
  }

  // Title string keyword search fallback
  const titleStr = typeof schemeObjOrTitle === 'string' ? schemeObjOrTitle : (schemeObjOrTitle?.title || schemeObjOrTitle?.name_en || '');
  if (titleStr) {
    for (const [key, url] of Object.entries(CLOUDINARY_SCHEME_IMAGES)) {
      if (titleStr.toLowerCase().includes(key.toLowerCase())) {
        return url;
      }
    }
  }

  return '';
};
