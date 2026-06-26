import { collection, doc, getDocs, setDoc, query, orderBy, limit, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Customer, FamilyMember } from "../types";

export async function fetchCustomers(): Promise<Customer[]> {
  const querySnapshot = await getDocs(collection(db, "customers"));
  const customers: Customer[] = [];
  
  for (const customerDoc of querySnapshot.docs) {
    const data = customerDoc.data() as Omit<Customer, 'id' | 'family'>;
    const familySnapshot = await getDocs(collection(db, "customers", customerDoc.id, "family"));
    const family = familySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember));
    
    customers.push({
      id: customerDoc.id,
      ...data,
      family
    });
  }
  
  return customers;
}

export async function seedSampleData() {
  const customersCollection = collection(db, "customers");
  const snapshot = await getDocs(query(customersCollection, limit(1)));
  
  if (!snapshot.empty) return; // Already seeded

  const sampleCustomers = [
    {
      id: "cust_001",
      name: "田中 太郎",
      address: "東京都新宿区西新宿1-1-1",
      city: "新宿区",
      details: { "電話番号": "090-1234-5678", "メール": "tanaka@example.com" },
      family: [
        { name: "田中 結衣", dob: "2020/05/15", job: "保育園", allergy: "卵", info: "元気な女の子" },
        { name: "田中 健太", dob: "2022/10/01", job: "自宅", allergy: "なし", info: "おっとりしている" }
      ]
    },
    {
      id: "cust_002",
      name: "佐藤 愛子",
      address: "東京都港区芝公園4-2-8",
      city: "港区",
      details: { "電話番号": "080-9876-5432", "メール": "sato@example.com" },
      family: [
        { name: "佐藤 蓮", dob: "2019/02/20", job: "幼稚園", allergy: "小麦", info: "活発で走り回るのが好き" }
      ]
    },
    {
      id: "cust_003",
      name: "鈴木 一郎",
      address: "東京都世田谷区北沢2-10-1",
      city: "世田谷区",
      details: { "電話番号": "070-1111-2222", "メール": "suzuki@example.com" },
      family: [
        { name: "鈴木 美咲", dob: "2021/08/12", job: "保育園", allergy: "牛乳", info: "人見知りがある" }
      ]
    },
    {
      id: "cust_004",
      name: "高橋 健司",
      address: "東京都中野区中野5-6-7",
      city: "中野区",
      details: { "電話番号": "090-3333-4444", "メール": "takahashi@example.com" },
      family: [
        { name: "高橋 颯太", dob: "2020/12/30", job: "保育園", allergy: "そば", info: "電車が大好き" }
      ]
    },
    {
      id: "cust_005",
      name: "伊藤 弘美",
      address: "東京都杉並区高円寺南4-5-6",
      city: "杉並区",
      details: { "電話番号": "080-5555-6666", "メール": "ito@example.com" },
      family: [
        { name: "伊藤 陽菜", dob: "2022/03/10", job: "自宅", allergy: "なし", info: "よく笑う" }
      ]
    },
    {
      id: "cust_006",
      name: "渡辺 亮",
      address: "東京都練馬区豊玉北5-6-7",
      city: "練馬区",
      details: { "電話番号": "070-7777-8888", "メール": "watanabe@example.com" },
      family: [
        { name: "渡辺 湊", dob: "2018/06/25", job: "小学校1年", allergy: "ピーナッツ", info: "お兄ちゃん気質" }
      ]
    },
    {
      id: "cust_007",
      name: "小林 直子",
      address: "東京都大田区蒲田5-6-7",
      city: "大田区",
      details: { "電話番号": "090-9999-0000", "メール": "kobayashi@example.com" },
      family: [
        { name: "小林 葵", dob: "2021/01/05", job: "保育園", allergy: "エビ", info: "おままごとが好き" }
      ]
    },
    {
      id: "cust_008",
      name: "加藤 博",
      address: "東京都北区王子1-2-3",
      city: "北区",
      details: { "電話番号": "080-1212-3434", "メール": "kato@example.com" },
      family: [
        { name: "加藤 結愛", dob: "2023/07/20", job: "自宅", allergy: "なし", info: "離乳食開始" }
      ]
    },
    {
      id: "cust_009",
      name: "吉田 恵",
      address: "東京都江戸川区中央1-2-3",
      city: "江戸川区",
      details: { "電話番号": "070-5656-7878", "メール": "yoshida@example.com" },
      family: [
        { name: "吉田 翔麻", dob: "2019/11/11", job: "幼稚園", allergy: "なし", info: "恐竜に詳しい" }
      ]
    },
    {
      id: "cust_010",
      name: "山口 慎吾",
      address: "東京都足立区千住1-2-3",
      city: "足立区",
      details: { "電話番号": "090-2424-6868", "メール": "yamaguchi@example.com" },
      family: [
        { name: "山口 凛", dob: "2020/04/01", job: "保育園", allergy: "フルーツ", info: "絵本が大好き" }
      ]
    }
  ];

  for (const sample of sampleCustomers) {
    const { family, ...customerData } = sample;
    const customerRef = doc(db, "customers", sample.id);
    await setDoc(customerRef, customerData);
    
    for (const member of family) {
      await addDoc(collection(customerRef, "family"), member);
    }
  }
}
