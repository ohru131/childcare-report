export interface FamilyMember {
  id?: string;
  name: string;
  dob: string;
  job: string;
  allergy: string;
  info: string;
}

export interface CustomerDetailItem {
  key: string;
  value: string;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  city: string;
  details: Record<string, string> | CustomerDetailItem[];
  lat?: number;
  lng?: number;
  family?: FamilyMember[];
}

export interface Report {
  id?: string;
  type: 'daily' | 'accident';
  timestamp: any; // Firestore Timestamp
  reporterId: string;
  reporterName: string;
  customerId: string;
  customerName: string;
  reportDate: string;
  content: any;
  riskRating?: number;
  esRating?: number;
}

export interface Receipt {
  id?: string;
  reportId?: string;
  customerId?: string;
  customerName?: string;
  staffId: string;
  staffName: string;
  amount: number;
  storeName: string;
  receiptDate: string;
  imageUrl: string;
  handoffText: string;
  timestamp: any;
}

export interface AiModelConfig {
  dailyReport: string;
  accidentReport: string;
  receiptOcr: string;
}

export interface PromptConfig {
  generateWithWarnings: string;
  generateAccident: string;
  placeholderDaily: string;
  placeholderAccident: string;
  hintAccident: string;
  placeholderHiyari: string;
}

export interface AppSettings {
  models: AiModelConfig;
  prompts: PromptConfig;
}
