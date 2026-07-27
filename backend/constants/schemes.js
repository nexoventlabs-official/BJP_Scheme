/**
 * Single Source of Truth — All 23 BJP Nalam Thittam Schemes
 * Used by schemeController.js, adminController.js, and any other backend reference.
 */
const BJP_SCHEMES = [
  // Cluster 1: Insurance
  { id: 1,  name: 'PMSBY',            fullName: 'PMSBY — Suraksha Bima Yojana',      cluster: 'Cluster 1 — Insurance',       benefit: '₹2L accident insurance — ₹20/year',                      keys: ['pmsby', 'suraksha bima', 'accident insurance'] },
  { id: 2,  name: 'PMJJBY',           fullName: 'PMJJBY — Jeevan Jyoti Bima',        cluster: 'Cluster 1 — Insurance',       benefit: '₹2L life insurance — ₹436/year',                          keys: ['pmjjby', 'jeevan jyoti', 'life insurance'] },
  { id: 3,  name: 'APY',              fullName: 'APY — Atal Pension Yojana',          cluster: 'Cluster 1 — Insurance',       benefit: 'Pension ₹1K–5K/month after 60',                           keys: ['apy', 'atal pension', 'pension yojana'] },
  // Cluster 2: Credit
  { id: 4,  name: 'PM SVANidhi',      fullName: 'PM SVANidhi — Street Vendor Loan',   cluster: 'Cluster 2 — Credit',          benefit: '₹10K–50K collateral-free loan (street vendors)',           keys: ['svanidhi', 'street vendor', 'pm svanidhi'] },
  { id: 5,  name: 'PM Mudra Shishu',  fullName: 'PM Mudra Shishu',                   cluster: 'Cluster 2 — Credit',          benefit: 'Business loan up to ₹50,000',                              keys: ['mudra shishu', 'shishu', 'mudra loan'] },
  { id: 6,  name: 'PM Mudra Kishor',  fullName: 'PM Mudra Kishor',                   cluster: 'Cluster 2 — Credit',          benefit: '₹50K–5L loan',                                            keys: ['mudra kishor', 'kishor'] },
  { id: 7,  name: 'Udyam',            fullName: 'Udyam Registration',                cluster: 'Cluster 2 — Credit',          benefit: 'Free MSME registration — all govt benefits',               keys: ['udyam', 'msme', 'udyam registration'] },
  { id: 8,  name: 'Stand Up India',   fullName: 'Stand Up India',                    cluster: 'Cluster 2 — Credit',          benefit: '₹10L–1Cr loan for SC/ST & women',                         keys: ['stand up', 'standup', 'standup india'] },
  { id: 9,  name: 'Startup Seed Fund',fullName: 'Startup India Seed Fund',           cluster: 'Cluster 2 — Credit',          benefit: 'Seed funding for registered startups',                    keys: ['startup', 'seed fund', 'startup india'] },
  // Cluster 3: Farmers
  { id: 10, name: 'PM Kisan',         fullName: 'PM Kisan Samman Nidhi',             cluster: 'Cluster 3 — Farmers',         benefit: '₹6,000/year — 3 installments',                            keys: ['pm kisan', 'kisan samman', 'kisan nidhi'] },
  { id: 11, name: 'PM Fasal Bima',    fullName: 'PM Fasal Bima Yojana',              cluster: 'Cluster 3 — Farmers',         benefit: 'Crop insurance — natural calamities & pests',              keys: ['fasal bima', 'crop insurance', 'pmfby'] },
  { id: 12, name: 'PM Kisan Maan Dhan',fullName:'PM Kisan Maan Dhan Yojana',        cluster: 'Cluster 3 — Farmers',         benefit: 'Farmer pension ₹3,000/month after 60',                    keys: ['maan dhan', 'farmer pension', 'kisan maan dhan'] },
  // Cluster 4: Health
  { id: 13, name: 'Ayushman Bharat',  fullName: 'Ayushman Bharat PMJAY',             cluster: 'Cluster 4 — Health',          benefit: '₹5 lakh/year cashless hospitalisation',                   keys: ['ayushman', 'pmjay', 'ayushman bharat', 'health insurance'] },
  { id: 14, name: 'ABHA',             fullName: 'ABHA — Unified Health ID',           cluster: 'Cluster 4 — Health',          benefit: 'Free digital health ID — gateway to health schemes',       keys: ['abha', 'health id', 'abdm', 'digital health'] },
  // Cluster 5: Women & Families
  { id: 15, name: 'PM Ujjwala',       fullName: 'PM Ujjwala Yojana',                 cluster: 'Cluster 5 — Women & Families',benefit: 'Free LPG connection for BPL families',                    keys: ['ujjwala', 'lpg', 'gas connection'] },
  { id: 16, name: 'PM Matru Vandana', fullName: 'PM Matru Vandana Yojana',           cluster: 'Cluster 5 — Women & Families',benefit: '₹5,000 cash for first pregnancy',                         keys: ['matru vandana', 'maternity', 'pmmvy'] },
  { id: 17, name: 'Sukanya Samridhi', fullName: 'Sukanya Samridhi Yojana',           cluster: 'Cluster 5 — Women & Families',benefit: 'High-interest savings for girl child education',           keys: ['sukanya', 'girl child', 'sukanya samridhi'] },
  // Cluster 6: Housing
  { id: 18, name: 'PM Awas Yojana',   fullName: 'PM Awas Yojana (PMAY)',             cluster: 'Cluster 6 — Housing',         benefit: '₹1.2–1.3L to build or upgrade home',                     keys: ['awas', 'pmay', 'housing', 'pm awas'] },
  // Cluster 7: Youth & Skills
  { id: 19, name: 'PMKVY',            fullName: 'PMKVY — Kaushal Vikas Yojana',      cluster: 'Cluster 7 — Youth & Skills',  benefit: 'Free skill training in 300+ trades',                      keys: ['pmkvy', 'kaushal vikas', 'skill training'] },
  { id: 20, name: 'NSP Scholarship',  fullName: 'NSP — National Scholarship Portal', cluster: 'Cluster 7 — Youth & Skills',  benefit: 'Govt scholarships for Class 1 to PhD',                    keys: ['nsp', 'scholarship', 'national scholarship'] },
  { id: 21, name: 'PM Vishwakarma',   fullName: 'PM Vishwakarma Yojana',             cluster: 'Cluster 7 — Youth & Skills',  benefit: 'Training & credit for traditional artisans',              keys: ['vishwakarma', 'artisan', 'pm vishwakarma'] },
  // Foundation Layer
  { id: 22, name: 'Jan Dhan',         fullName: 'Jan Dhan Yojana',                   cluster: 'Foundation Layer',             benefit: 'Zero-balance bank account — DBT gateway',                 keys: ['jan dhan', 'zero-balance', 'jdyojana', 'pmjdy'] },
  { id: 23, name: 'e-Shram',          fullName: 'e-Shram Card',                      cluster: 'Foundation Layer',             benefit: 'Unorganised worker registration + PMSBY cover',           keys: ['e-shram', 'eshram', 'unorganised worker', 'e shram'] },
];

module.exports = { BJP_SCHEMES };
