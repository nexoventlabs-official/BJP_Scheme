/**
 * Seed / enrich the Scheme collection with the 23 BJP Nalam Thittam schemes,
 * including full English content (overview, eligibility, how-to-apply, link,
 * highlight, tags, documents, steps) so the catalog is fully DB-driven.
 *
 * Safe to re-run:
 *   - New schemes are inserted with their Cloudinary image.
 *   - Existing schemes have their text content refreshed, but an admin-uploaded
 *     image, custom display order, and active flag are preserved.
 *
 * Run:  node scripts/seedSchemes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');
const { BJP_SCHEMES } = require('../constants/schemes');

// Existing Cloudinary background images, keyed by scheme name.
const IMAGE_BY_NAME = {
  'PMSBY': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409434/bjp_schemes/PMSBY.png',
  'PMJJBY': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409427/bjp_schemes/PMJJBY.png',
  'APY': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409389/bjp_schemes/APY.png',
  'PM SVANidhi': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409419/bjp_schemes/PM_SVANidhi.png',
  'PM Mudra Shishu': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409417/bjp_schemes/PM_Mudra_Shishu.png',
  'PM Mudra Kishor': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409415/bjp_schemes/PM_Mudra_Kishor.png',
  'Udyam': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409442/bjp_schemes/Udyam.png',
  'Stand Up India': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409435/bjp_schemes/Stand_Up_India.png',
  'Startup Seed Fund': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409437/bjp_schemes/Startup_Seed_Fund.png',
  'PM Kisan': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409410/bjp_schemes/PM_Kisan.png',
  'PM Fasal Bima': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409404/bjp_schemes/PM_Fasal_Bima.png',
  'PM Kisan Maan Dhan': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409407/bjp_schemes/PM_Kisan_Maan_Dhan.png',
  'Ayushman Bharat': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409392/bjp_schemes/Ayushman_Bharat.png',
  'ABHA': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409290/bjp_schemes/ABHA.png',
  'PM Ujjwala': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409421/bjp_schemes/PM_Ujjwala.png',
  'PM Matru Vandana': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409412/bjp_schemes/PM_Matru_Vandana.png',
  'Sukanya Samridhi': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409441/bjp_schemes/Sukanya_Samridhi.png',
  'PM Awas Yojana': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409401/bjp_schemes/PM_Awas_Yojana.png',
  'PMKVY': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409429/bjp_schemes/PMKVY.png',
  'NSP Scholarship': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409399/bjp_schemes/NSP_Scholarship.png',
  'PM Vishwakarma': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409423/bjp_schemes/PM_Vishwakarma.png',
  'Jan Dhan': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409397/bjp_schemes/Jan_Dhan.png',
  'e-Shram': 'https://res.cloudinary.com/dkjrdntf/image/upload/v1785409395/bjp_schemes/e-Shram.png',
};

// Full English content per scheme id.
const ENRICH = {
  1: { icon: '🛡️', clusterShort: 'Insurance', highlight: '₹2L ACCIDENT COVER — ₹20/YR', link: 'https://jansuraksha.gov.in',
    overview: 'Accidental death and disability cover of ₹2 lakh at a premium of just ₹20/year, auto-debited from your savings account every June.',
    eligibility: 'Indian citizens aged 18–70 with an active savings bank account linked to Aadhaar.',
    howToApply: 'Visit your bank branch or enable via net banking / banking app. Annual premium of ₹20 is auto-debited.',
    tags: ['Accident Insurance', '₹2 Lakhs Cover', '₹20 Annual Premium'],
    documents: ['Aadhaar Card', 'Bank Account Passbook (Auto-Debit)', 'Nominee Details'],
    steps: ['Visit your bank branch or access net-banking portal', 'Fill PMSBY enrollment form', 'Authorize annual auto-debit of ₹20'] },
  2: { icon: '❤️', clusterShort: 'Insurance', highlight: '₹2L LIFE COVER — ₹436/YR', link: 'https://jansuraksha.gov.in',
    overview: 'Life insurance of ₹2 lakh on death from any cause at ₹436/year premium, auto-debited from your bank account. Renewable annually.',
    eligibility: 'Indian citizens aged 18–50 with an active savings bank account. Cover continues until age 55.',
    howToApply: 'Enroll at your bank branch or banking app. Premium is auto-debited each June. Nomination can be updated anytime.',
    tags: ['Life Insurance', '₹2 Lakhs Death Benefit', 'Any Cause Cover'],
    documents: ['Aadhaar Card', 'Savings Bank Account', 'Nominee Aadhaar & Relationship'],
    steps: ['Contact savings bank or mobile banking app', 'Submit PMJJBY consent form', 'Enable auto-debit of ₹436 annual premium'] },
  3: { icon: '👴', clusterShort: 'Insurance', highlight: 'PENSION UP TO ₹5,000/MONTH', link: 'https://npscra.nsdl.co.in/scheme-details.php',
    overview: 'Guaranteed monthly pension of ₹1,000 to ₹5,000 after age 60. The government co-contributes 50% (up to ₹1,000/year) for eligible subscribers.',
    eligibility: 'Indian citizens aged 18–40 with a savings bank account. Not already covered under statutory pension schemes.',
    howToApply: 'Open an APY account at your bank. Choose your desired monthly pension and the system calculates your contribution automatically.',
    tags: ['Guaranteed Pension', 'Post-60 Retirement', 'Unorganized Sector'],
    documents: ['Aadhaar Card', 'Mobile Number', 'Savings Bank Account Details'],
    steps: ['Approach bank branch or use online APY portal', 'Choose pension slab (₹1,000 to ₹5,000)', 'Contributions auto-deducted monthly'] },
  4: { icon: '🛒', clusterShort: 'Credit', highlight: 'COLLATERAL-FREE LOAN UP TO ₹50,000', link: 'https://pmsvanidhi.mohua.gov.in',
    overview: 'Collateral-free working capital loans for street vendors — ₹10,000 initially, scaling up to ₹50,000 on timely repayment. 7% interest subsidy available.',
    eligibility: 'Street vendors operating in urban areas with a Vending Certificate or letter of recommendation from the Urban Local Body (ULB).',
    howToApply: 'Apply at pmsvanidhi.mohua.gov.in or visit any bank / MFI branch. Vending certificate or ULB recommendation required.',
    tags: ['Street Vendors', 'Collateral-Free Loan', '7% Interest Subsidy'],
    documents: ['Aadhaar Card', 'Vending Certificate / ULB LOR', 'Bank Account Passbook'],
    steps: ['Apply at pmsvanidhi.mohua.gov.in or nearest bank', 'Attach Vending ID', 'Receive collateral-free credit in bank account'] },
  5: { icon: '💼', clusterShort: 'Credit', highlight: 'BUSINESS LOAN UP TO ₹50,000', link: 'https://www.mudra.org.in',
    overview: 'Micro-business loans up to ₹50,000 for non-farm small enterprises — no collateral required. Covers manufacturing, trading, and service sectors.',
    eligibility: 'Non-corporate, non-farm small or micro-enterprises. Open to new and existing businesses seeking startup or expansion capital.',
    howToApply: 'Apply at any bank, MFI, or NBFC with a simple business plan and identity/address proof. Loans typically processed within 7–10 days.',
    tags: ['No Collateral', 'Micro Loan', 'Startup Capital'],
    documents: ['Aadhaar & PAN Card', 'Business Identity Proof', 'Bank Account Statement'],
    steps: ['Visit nearest bank or MFI branch', 'Submit business plan & KYC', 'Receive loan sanction in 7-10 days'] },
  6: { icon: '📈', clusterShort: 'Credit', highlight: 'BUSINESS LOAN ₹50,000 TO ₹5 LAKHS', link: 'https://www.mudra.org.in',
    overview: 'Business expansion loans from ₹50,000 to ₹5 lakh for small enterprises with a proven track record. No collateral required.',
    eligibility: 'Existing micro-enterprise owners with proof of at least 1 year of business activity. Any sector — manufacturing, trading, services.',
    howToApply: 'Apply at your nearest bank or NBFC with last 6 months bank statements and existing business proof.',
    tags: ['Business Expansion', 'Up to ₹5 Lakhs', 'Collateral Free'],
    documents: ['Aadhaar & Business PAN', '6 Months Bank Statement', 'Business Registration'],
    steps: ['Apply at bank branch', 'Submit business financial statements', 'Receive loan disbursement'] },
  7: { icon: '🏭', clusterShort: 'Credit', highlight: 'FREE MSME CERTIFICATE', link: 'https://udyamregistration.gov.in',
    overview: 'Free online MSME registration that unlocks government subsidies, priority loans, tax benefits, and preferential treatment in government tenders.',
    eligibility: 'Any business with annual turnover below ₹250 crore — manufacturing or service sector, sole proprietor to private limited.',
    howToApply: 'Register free at udyamregistration.gov.in using Aadhaar and PAN. Certificate issued instantly. No documents to upload.',
    tags: ['Instant Certificate', 'Priority Bank Credit', 'Govt Subsidies'],
    documents: ['Aadhaar Card (Proprietor)', 'PAN Card', 'GSTIN (if applicable)'],
    steps: ['Visit udyamregistration.gov.in', 'Enter Aadhaar & OTP', 'Download official Udyam MSME Certificate'] },
  8: { icon: '💪', clusterShort: 'Credit', highlight: 'LOANS ₹10 LAKHS TO ₹1 CRORE', link: 'https://www.standupmitra.in',
    overview: 'Bank loans from ₹10 lakh to ₹1 crore to help SC/ST individuals and women entrepreneurs set up greenfield enterprises.',
    eligibility: 'SC/ST individuals or women borrowers above 18 years setting up their first enterprise in manufacturing, services, or trading sectors.',
    howToApply: 'Apply online at standupmitra.in or visit the nearest bank branch with a business plan and KYC documents.',
    tags: ['SC/ST & Women', '₹10L to ₹1Cr Loan', 'Greenfield Enterprise'],
    documents: ['Aadhaar & PAN Card', 'Caste Certificate (if SC/ST)', 'Detailed Project Report (DPR)'],
    steps: ['Apply at standupmitra.in', 'Submit project report to bank', 'Receive loan approval and disbursement'] },
  9: { icon: '🚀', clusterShort: 'Credit', highlight: 'SEED FUNDING UP TO ₹50 LAKHS', link: 'https://seedfund.startupindia.gov.in',
    overview: 'Seed funding up to ₹20 lakh for proof-of-concept and up to ₹50 lakh for prototype development — disbursed through DPIIT-recognized incubators.',
    eligibility: 'DPIIT-recognized startups incorporated in India for less than 2 years with a scalable, innovative business model.',
    howToApply: 'Obtain DPIIT recognition first at startupindia.gov.in, then apply to empanelled incubators through the Seed Fund portal.',
    tags: ['Startup Funding', 'Proof of Concept', 'Incubator Support'],
    documents: ['DPIIT Recognition Cert.', 'Company Incorporation Cert.', 'Pitch Deck / Prototype Details'],
    steps: ['Register on startupindia.gov.in', 'Apply to DPIIT-approved incubators', 'Receive seed grant funding'] },
  10: { icon: '🌾', clusterShort: 'Farmers', highlight: '₹6,000/YEAR DIRECT CASH', link: 'https://pmkisan.gov.in',
    overview: 'Direct income support of ₹6,000/year paid in 3 installments of ₹2,000 directly into farmers\' Aadhaar-linked bank accounts — no middlemen.',
    eligibility: 'All landholding farmer families. Excludes income tax payers, institutional landholders, and certain government employees.',
    howToApply: 'Self-register at pmkisan.gov.in or visit the nearest Common Service Centre (CSC) with Aadhaar and land records.',
    tags: ['Direct Cash Transfer', '₹6,000 Annual Benefit', 'Landholding Farmers'],
    documents: ['Aadhaar Card', 'Land Records (Patta / Chitta)', 'Aadhaar-Seeded Bank Passbook'],
    steps: ['Visit pmkisan.gov.in for self-registration', 'Submit Patta/Chitta details', 'Receive ₹2,000 installments directly in bank'] },
  11: { icon: '🌱', clusterShort: 'Farmers', highlight: 'CROP LOSS INSURANCE COVER', link: 'https://pmfby.gov.in',
    overview: 'Subsidized crop insurance protecting farmers from losses due to drought, floods, pests, and disease. Premium is just 1.5%–5% of sum insured.',
    eligibility: 'All farmers — loanee and non-loanee — growing notified crops in notified areas. Enroll before the cut-off date each season.',
    howToApply: 'Enroll through your bank (if loanee), nearest CSC, or an insurance company agent before the seasonal cut-off date.',
    tags: ['Crop Insurance', 'Natural Risk Cover', 'Subsidized Premium'],
    documents: ['Aadhaar Card', 'Land Ownership / Sowing Cert.', 'Bank Passbook'],
    steps: ['Apply on pmfby.gov.in or bank', 'Upload crop sowing cert', 'Pay heavily subsidized premium (1.5%-2%)'] },
  12: { icon: '🚜', clusterShort: 'Farmers', highlight: '₹3,000 MONTHLY PENSION', link: 'https://pmkmy.gov.in',
    overview: 'Voluntary pension scheme giving small and marginal farmers a guaranteed monthly pension of ₹3,000 after age 60. Government matches your contribution.',
    eligibility: 'Small and marginal farmers aged 18–40 with landholding up to 2 hectares. Must not already receive other statutory pensions.',
    howToApply: 'Enroll at the nearest CSC or Krishi Bhawan with Aadhaar, bank passbook, and land records. Monthly contribution is small and income-matched.',
    tags: ['Farmer Pension', '₹3,000 Guaranteed', 'Old Age Security'],
    documents: ['Aadhaar Card', 'Savings Bank / PM-Kisan A/c', 'Land Records'],
    steps: ['Enroll at nearest CSC', 'Set up auto-debit contribution', 'Receive ₹3,000 monthly pension after age 60'] },
  13: { icon: '🏥', clusterShort: 'Health', highlight: '₹5 LAKHS CASHLESS HEALTH COVER', link: 'https://pmjay.gov.in',
    overview: '₹5 lakh per family per year cashless health cover for secondary and tertiary hospitalisation at over 25,000 empanelled hospitals nationwide — completely free.',
    eligibility: 'Families listed in SECC 2011 database. Check your eligibility at pmjay.gov.in using your Aadhaar or ration card number.',
    howToApply: 'Visit any empanelled hospital with your Aadhaar or beneficiary ID. Ayushman card is issued free at the hospital or CSC.',
    tags: ['₹5 Lakhs Health Cover', 'Cashless Hospitalisation', 'Empanelled Network'],
    documents: ['Aadhaar Card', 'Ration Card / Beneficiary ID'],
    steps: ['Check eligibility at pmjay.gov.in', 'Visit empanelled hospital', 'Get free Ayushman Card for cashless treatment'] },
  14: { icon: '🪪', clusterShort: 'Health', highlight: '14-DIGIT DIGITAL HEALTH ID', link: 'https://abha.abdm.gov.in',
    overview: 'A 14-digit digital health ID that stores all your health records, prescriptions, lab reports, and diagnoses in one secure, shareable place.',
    eligibility: 'All Indian citizens. Completely free. Created using Aadhaar or driving licence — takes under 2 minutes.',
    howToApply: 'Create instantly at abha.abdm.gov.in or the Aarogya Setu app using your Aadhaar OTP. No documents needed.',
    tags: ['Digital Health Card', 'ABDM Network', 'Instant Creation'],
    documents: ['Aadhaar Card (Mobile Linked)'],
    steps: ['Visit abha.abdm.gov.in', 'Enter Aadhaar & OTP', 'Download ABHA Card instantly'] },
  15: { icon: '🔥', clusterShort: 'Women', highlight: 'FREE LPG CONNECTION', link: 'https://www.pmuy.gov.in',
    overview: 'Free LPG gas connection to women from Below Poverty Line households — includes a free cylinder, pressure regulator, and connecting pipe.',
    eligibility: 'Women from BPL/SECC households, SC/ST families, Antyodaya Anna Yojana beneficiaries without an existing LPG connection.',
    howToApply: 'Apply at the nearest LPG distributor with Aadhaar, BPL ration card or Antyodaya card, and bank account details.',
    tags: ['Free Cooking Gas', 'Women Empowerment', 'Clean Kitchen'],
    documents: ['Aadhaar Card (All Adult Members)', 'Ration Card / BPL Certificate', 'Bank Account Passbook'],
    steps: ['Apply at LPG distributor', 'Attach family Aadhaar & Ration card', 'Receive free LPG cylinder & stove'] },
  16: { icon: '🤱', clusterShort: 'Women', highlight: '₹5,000 DIRECT CASH', link: 'https://wcd.nic.in/schemes/pradhan-mantri-matru-vandana-yojana',
    overview: 'Cash incentive of ₹5,000 paid in 3 installments to pregnant and lactating mothers for their first live birth — to compensate for wage loss and improve nutrition.',
    eligibility: 'Pregnant and lactating women aged 19+ registering their first live birth. Excludes those already receiving similar benefits under other schemes.',
    howToApply: 'Register at the nearest Anganwadi Centre (AWC) or health facility within 150 days of pregnancy with your mother-child protection card.',
    tags: ['Maternal Health', '₹5,000 Cash DBT', 'First Child Benefit'],
    documents: ['Mother Aadhaar', 'MCP Card', 'Bank Passbook'],
    steps: ['Register at Anganwadi / Health Center', 'Upload MCP Card', 'Receive ₹5,000 cash in 2 installments'] },
  17: { icon: '👧', clusterShort: 'Women', highlight: '8.2% TAX-FREE INTEREST', link: 'https://www.nsiindia.gov.in',
    overview: 'Government-backed savings scheme at 8.2% p.a. (tax-free) for a girl child\'s future education and marriage. Matures when she turns 21.',
    eligibility: 'Parents or guardians of girl children below 10 years. One account per girl, maximum 2 accounts per family. Minimum deposit ₹250/year.',
    howToApply: 'Open an account at any post office or authorised bank with the girl\'s birth certificate and parent/guardian KYC documents.',
    tags: ['Girl Child Savings', '8.2% Interest Rate', 'Tax Exempt 80C'],
    documents: ['Child Birth Certificate', 'Parent Aadhaar & PAN Card'],
    steps: ['Visit Post Office or Bank branch', 'Fill SSY form', 'Deposit min ₹250/yr (earn 8.2% tax-free interest)'] },
  18: { icon: '🏠', clusterShort: 'Housing', highlight: '₹1.2L TO ₹1.3L HOUSING SUBSIDY', link: 'https://pmayg.nic.in',
    overview: 'Financial assistance of ₹1.2–₹1.3 lakh to construct a pucca house or upgrade a kutcha/dilapidated house — paid directly into the beneficiary\'s bank account.',
    eligibility: 'Houseless families or those in kutcha/dilapidated houses as per SECC 2011 data (rural) or ULB priority list (urban). Must not own a pucca house.',
    howToApply: 'Apply through your Gram Panchayat (rural) or Urban Local Body office (urban). Beneficiaries are selected from the SECC priority list.',
    tags: ['Pucca House Subsidy', 'PMAY Urban & Rural', 'DBT Housing Fund'],
    documents: ['Aadhaar Card', 'Job Card / SECC Proof', 'Bank Passbook'],
    steps: ['Apply at Gram Panchayat / ULB office', 'SECC priority list verification', 'Receive construction funds in bank'] },
  19: { icon: '🎓', clusterShort: 'Youth', highlight: 'FREE SKILL TRAINING & CERTIFICATE', link: 'https://www.pmkvyofficial.org',
    overview: 'Free short-term skill training in 300+ job roles across IT, construction, healthcare, hospitality, electronics, and more — with placement support and a government certificate.',
    eligibility: 'Any Indian citizen above 15 years. School/college dropouts and unemployed youth are priority beneficiaries.',
    howToApply: 'Enroll at a nearby PMKVY training centre or register at skillindiadigital.gov.in. Training is completely free. Stipend provided during training.',
    tags: ['Skill Certification', 'Free Training', 'Job Placement'],
    documents: ['Aadhaar Card', 'Educational Certificate', 'Bank Account'],
    steps: ['Register at skillindiadigital.gov.in', 'Enroll at PMKK center', 'Complete training & receive certificate'] },
  20: { icon: '📚', clusterShort: 'Youth', highlight: 'PRE & POST MATRIC GRANTS', link: 'https://scholarships.gov.in',
    overview: 'Single portal for all central government scholarships — covering minority, OBC, SC/ST, merit, and disability categories from Class 1 through PhD.',
    eligibility: 'Students from Class 1 to PhD. Eligibility varies by scheme — based on community, family income, and academic performance.',
    howToApply: 'Register at scholarships.gov.in with Aadhaar, bank account, and academic documents. Apply before the annual deadline (typically Oct–Nov).',
    tags: ['Student Scholarships', 'Higher Education', 'Direct Fee Support'],
    documents: ['Student Aadhaar / Bonafide Cert.', 'Marksheet', 'Income Certificate'],
    steps: ['Register on scholarships.gov.in', 'Select scheme & upload docs', 'Receive scholarship via DBT'] },
  21: { icon: '🔨', clusterShort: 'Youth', highlight: '₹15,000 TOOLKIT GRANT & 5% LOAN', link: 'https://pmvishwakarma.gov.in',
    overview: 'End-to-end support for 18 traditional crafts — free skill training, toolkit grant up to ₹15,000, and collateral-free credit up to ₹3 lakh at 5% interest.',
    eligibility: '18 designated trades including carpenter, blacksmith, goldsmith, potter, tailor, cobbler, mason, and more. Self-employed artisans working with hand tools.',
    howToApply: 'Register through your nearest Common Service Centre (CSC) or Gram Panchayat with Aadhaar and a trade declaration form.',
    tags: ['18 Artisan Trades', '₹15K Toolkit Grant', '5% Concessional Credit'],
    documents: ['Aadhaar Card (Mobile Linked)', 'Ration Card / Trade Declaration', 'Bank Passbook'],
    steps: ['Register at CSC', 'Complete verification & skill training', 'Receive ₹15k toolkit voucher & loan'] },
  22: { icon: '🏦', clusterShort: 'Foundation', highlight: 'ZERO BALANCE BANK ACCOUNT', link: 'https://pmjdy.gov.in',
    overview: 'Zero-balance savings account with a free RuPay debit card, ₹2 lakh accident insurance cover, and ₹10,000 overdraft facility after 6 months.',
    eligibility: 'Any Indian citizen without an existing bank account. Can be opened at any bank branch or Business Correspondent kiosk with minimal KYC.',
    howToApply: 'Visit the nearest bank branch or Business Correspondent kiosk with Aadhaar or voter ID. Account is opened on the spot.',
    tags: ['Zero Balance Account', 'RuPay Debit Card', 'DBT Gateway'],
    documents: ['Aadhaar Card', 'Passport Photograph'],
    steps: ['Visit bank branch / BC kiosk', 'Fill PMJDY form', 'Receive RuPay debit card'] },
  23: { icon: '👷', clusterShort: 'Foundation', highlight: 'UNIVERSAL WORKER ID CARD', link: 'https://eshram.gov.in',
    overview: 'National database card for unorganised workers — provides access to all social security schemes and automatic ₹2 lakh accident insurance under PMSBY.',
    eligibility: 'All unorganised sector workers aged 16–59 who are not EPFO/ESIC members — daily wage, gig, domestic, construction, street vendor workers.',
    howToApply: 'Self-register at eshram.gov.in or visit the nearest CSC with Aadhaar and a bank account. UAN card is issued within minutes.',
    tags: ['Worker ID Card', 'Unorganised Sector', 'Accident Insurance'],
    documents: ['Aadhaar Card (Mobile Linked)', 'Savings Bank Account Number & IFSC Code'],
    steps: ['Visit eshram.gov.in or nearest CSC', 'Self-register using Aadhaar-linked mobile for OTP', 'Fill occupation & bank details', 'Download 12-digit UAN e-Shram Card'] },
};

async function seed() {
  await connectAppDb();
  console.log('Seeding / enriching schemes...');

  let inserted = 0;
  let updated = 0;

  for (const s of BJP_SCHEMES) {
    const enrich = ENRICH[s.id] || {};
    const content = {
      id: s.id,
      name: s.name,
      fullName: s.fullName || s.name,
      cluster: s.cluster || '',
      clusterShort: enrich.clusterShort || '',
      benefit: s.benefit || '',
      icon: enrich.icon || '📄',
      highlight: enrich.highlight || '',
      overview: enrich.overview || '',
      eligibility: enrich.eligibility || '',
      howToApply: enrich.howToApply || '',
      link: enrich.link || '',
      tags: enrich.tags || [],
      documents: enrich.documents || [],
      steps: enrich.steps || [],
      keys: s.keys || [],
    };

    const existing = await Scheme.findOne({ id: s.id });
    if (!existing) {
      content.backgroundImage = IMAGE_BY_NAME[s.name] || '';
      content.order = s.id;
      content.active = true;
      await Scheme.create(content);
      inserted++;
      console.log(`  + [${s.id}] ${s.name} (created)`);
    } else {
      // Refresh text content, but preserve admin-managed image / order / active.
      const update = { ...content };
      if (existing.backgroundImage) delete update.backgroundImage;
      else update.backgroundImage = IMAGE_BY_NAME[s.name] || '';
      await Scheme.updateOne({ id: s.id }, { $set: update });
      updated++;
      console.log(`  ~ [${s.id}] ${s.name} (enriched)`);
    }
  }

  console.log(`\nDone. Inserted ${inserted}, enriched ${updated}.`);
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
