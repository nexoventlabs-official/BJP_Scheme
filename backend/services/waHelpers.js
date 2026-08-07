/**
 * Shared helpers for the WhatsApp automation: phone normalization and a tiny
 * bilingual (EN/TA) string table used across the chatbot + flow endpoint.
 */

// WhatsApp `from` looks like 919876543210. User.mobile is the 10-digit number.
function last10(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

// The 6 Choose-Service tiles (id, EN/TA titles + descriptions, FlowImage key).
const SERVICES = [
  { id: 'my_profile',      iconKey: 'wa_svc_my_profile',      en: ['My Profile', 'View your registration details'],       ta: ['எனது சுயவிவரம்', 'உங்கள் பதிவு விவரங்கள்'] },
  { id: 'my_schemes',      iconKey: 'wa_svc_my_schemes',      en: ['My Schemes', 'Schemes you registered for'],           ta: ['எனது திட்டங்கள்', 'நீங்கள் விண்ணப்பித்த திட்டங்கள்'] },
  { id: 'apply_schemes',   iconKey: 'wa_svc_apply_schemes',   en: ['Apply Schemes', 'Apply for more schemes'],            ta: ['திட்டங்களுக்கு விண்ணப்பி', 'மேலும் திட்டங்களுக்கு விண்ணப்பிக்க'] },
  { id: 'referral',        iconKey: 'wa_svc_referral',        en: ['My Referral Link', 'Share and invite others'],        ta: ['எனது பரிந்துரை இணைப்பு', 'மற்றவர்களை அழைக்கவும்'] },
  { id: 'members',         iconKey: 'wa_svc_members',         en: ['My Members', 'Members you referred'],                 ta: ['எனது உறுப்பினர்கள்', 'நீங்கள் பரிந்துரைத்தவர்கள்'] },
  { id: 'booth_president', iconKey: 'wa_svc_booth_president', en: ['Be a Booth President', 'Apply to lead your booth'],   ta: ['பூத் தலைவராகுங்கள்', 'உங்கள் பூத்திற்கு விண்ணப்பிக்க'] },
];

// Static UI strings by language.
const T = {
  en: {
    lang_body: 'Welcome to *BJP Nalam Thittam* 🪷\n\nPlease choose your language to continue.',
    lang_footer: 'BJP Tamil Nadu',
    btn_english: 'English',
    btn_tamil: 'தமிழ்',
    register_body: 'Welcome to *BJP Nalam Thittam* 🪷\n\nRegister once with your *EPIC (Voter ID)* number to access Central Government welfare schemes. Tap *Register* below.',
    register_cta: 'Register',
    choose_body: 'Namaste 🙏\n\nWelcome to *BJP Nalam Thittam*. Tap *Choose Service* to view your profile, schemes, referrals, members or apply to be a Booth President.',
    choose_cta: 'Choose Service',
    footer: 'BJP Tamil Nadu',
    fallback: 'Namaste 🙏 Type *hi* to open the menu.',
  },
  ta: {
    lang_body: '*BJP நலத் திட்டம்* 🪷 வரவேற்கிறோம்\n\nதொடர உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்.',
    lang_footer: 'BJP தமிழ்நாடு',
    btn_english: 'English',
    btn_tamil: 'தமிழ்',
    register_body: '*BJP நலத் திட்டம்* 🪷 வரவேற்கிறோம்\n\nமத்திய அரசு நலத்திட்டங்களைப் பெற உங்கள் *வாக்காளர் அடையாள (EPIC)* எண்ணுடன் ஒருமுறை பதிவு செய்யுங்கள். கீழே *பதிவு செய்ய* தட்டவும்.',
    register_cta: 'பதிவு செய்ய',
    choose_body: 'வணக்கம் 🙏\n\n*BJP நலத் திட்டம்* வரவேற்கிறோம். உங்கள் சுயவிவரம், திட்டங்கள், பரிந்துரைகள், உறுப்பினர்கள் அல்லது பூத் தலைவர் விண்ணப்பத்தைக் காண *சேவையைத் தேர்வு* செய்யவும்.',
    choose_cta: 'சேவையைத் தேர்வு',
    footer: 'BJP தமிழ்நாடு',
    fallback: 'வணக்கம் 🙏 மெனுவைத் திறக்க *hi* என தட்டச்சு செய்யவும்.',
  },
};

const t = (lang, key) => (T[lang] && T[lang][key]) || T.en[key] || '';

module.exports = { last10, SERVICES, T, t };
