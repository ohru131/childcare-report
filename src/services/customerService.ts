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
      name: "織田 信長",
      address: "京都府京都市中京区本能寺町522",
      city: "中京区",
      details: { "電話番号": "090-1234-5678", "メール": "nobunaga@example.com" },
      family: [
        { name: "織田 信忠", dob: "2020/05/15", job: "保育園", allergy: "卵", info: "元気な男の子" },
        { name: "織田 奇妙丸", dob: "2022/10/01", job: "自宅", allergy: "なし", info: "おっとりしている" }
      ]
    },
    {
      id: "cust_002",
      name: "豊臣 秀吉",
      address: "京都府京都市東山区茶屋町528",
      city: "東山区",
      details: { "電話番号": "080-9876-5432", "メール": "hideyoshi@example.com" },
      family: [
        { name: "豊臣 秀頼", dob: "2019/02/20", job: "幼稚園", allergy: "小麦", info: "活発で走り回るのが好き" }
      ]
    },
    {
      id: "cust_003",
      name: "徳川 家康",
      address: "京都府京都市中京区二条城町541",
      city: "中京区",
      details: { "電話番号": "070-1111-2222", "メール": "ieyasu@example.com" },
      family: [
        { name: "徳川 秀忠", dob: "2021/08/12", job: "保育園", allergy: "牛乳", info: "人見知りがある" }
      ]
    },
    {
      id: "cust_004",
      name: "坂本 龍馬",
      address: "京都府京都市伏見区南浜町263",
      city: "伏見区",
      details: { "電話番号": "090-3333-4444", "メール": "ryoma@example.com" },
      family: [
        { name: "坂本 おりょう", dob: "2020/12/30", job: "保育園", allergy: "そば", info: "元気いっぱいに遊ぶ" }
      ]
    },
    {
      id: "cust_005",
      name: "源 義経",
      address: "京都府京都市左京区鞍馬本町1074",
      city: "左京区",
      details: { "電話番号": "080-5555-6666", "メール": "yoshitsune@example.com" },
      family: [
        { name: "源 牛若丸", dob: "2022/03/10", job: "自宅", allergy: "なし", info: "よく笑う" }
      ]
    },
    {
      id: "cust_006",
      name: "足利 義満",
      address: "京都府京都市北区金閣寺町1",
      city: "北区",
      details: { "電話番号": "070-7777-8888", "メール": "yoshimitsu@example.com" },
      family: [
        { name: "足利 義持", dob: "2018/06/25", job: "小学校1年", allergy: "ピーナッツ", info: "お兄ちゃん気質" }
      ]
    },
    {
      id: "cust_007",
      name: "紫 式部",
      address: "京都府京都市上京区京都御苑3",
      city: "上京区",
      details: { "電話番号": "090-9999-0000", "メール": "shikibu@example.com" },
      family: [
        { name: "藤原 賢子", dob: "2021/01/05", job: "保育園", allergy: "エビ", info: "おままごとが好き" }
      ]
    },
    {
      id: "cust_008",
      name: "清少納言",
      address: "京都府京都市下京区烏丸通塩小路下ル",
      city: "下京区",
      details: { "電話番号": "080-1212-3434", "メール": "shonagon@example.com" },
      family: [
        { name: "橘 則季", dob: "2023/07/20", job: "自宅", allergy: "なし", info: "離乳食開始" }
      ]
    },
    {
      id: "cust_009",
      name: "平 清盛",
      address: "京都府京都市下京区西八条通",
      city: "下京区",
      details: { "電話番号": "070-5656-7878", "メール": "kiyomori@example.com" },
      family: [
        { name: "平 重盛", dob: "2019/11/11", job: "幼稚園", allergy: "なし", info: "恐竜に詳しい" }
      ]
    },
    {
      id: "cust_010",
      name: "明智 光秀",
      address: "京都府京都市右京区嵯峨小倉山堂ノ前町",
      city: "右京区",
      details: { "電話番号": "090-2424-6868", "メール": "mitsuhide@example.com" },
      family: [
        { name: "細川 ガラシャ", dob: "2020/04/01", job: "保育園", allergy: "フルーツ", info: "絵本が大好き" }
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
