import React, { useState, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { fetchCustomers, seedSampleData } from "./services/customerService";
import { Customer, Report, Receipt } from "./types";
import { Search, MapPin, User, FileText, Plus, LogOut, ChevronRight, Mic, Camera, FileUp, AlertTriangle, CheckCircle2, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import { generateDailyReport, generateAccidentReport, extractReceiptInfo } from "./services/geminiService";
import { saveReport, saveReceipt, getCustomerReports, getReceipts } from "./services/reportService";
import { db } from "./lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

// --- Main App Component ---
function AppContent() {
  const { user, signIn, logout, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("すべて");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize data
  useEffect(() => {
    async function init() {
      if (user) {
        await seedSampleData();
        const data = await fetchCustomers();
        setCustomers(data);
      }
    }
    init();
  }, [user]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCity = selectedCity === "すべて" || c.city === selectedCity;
      return matchesSearch && matchesCity;
    });
  }, [customers, searchQuery, selectedCity]);

  const cities = ["すべて", ...Array.from(new Set(customers.map(c => c.city)))];

  if (authLoading) return <div className="flex h-screen items-center justify-center">読み込み中...</div>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl bg-white p-10 shadow-2xl text-center"
        >
          <div className="mb-8 flex justify-center">
            <div className="rounded-lg bg-blue-600 p-4 shadow-lg shadow-blue-200">
              <FileText className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="mb-3 font-display text-3xl font-bold tracking-tight text-slate-900">保育日報</h1>
          <p className="mb-10 text-slate-500 font-medium">Childcare Professional Suite</p>
          <button
            onClick={signIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 py-4 font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-xl"
          >
            Googleアカウントでログイン
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-sm">C</div>
            <h1 className="font-display text-lg font-bold text-slate-900 tracking-tight">保育日報</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-none mb-1">{user.displayName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">スタッフ</p>
            </div>
            <button onClick={logout} className="rounded-lg p-2 hover:bg-slate-50 text-slate-400 border border-transparent hover:border-slate-200 transition-all">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Search & Filters */}
      <main className="mx-auto max-w-2xl px-6 pt-8">
        <div className="mb-8 flex flex-col gap-4">
          <button 
            onClick={() => {
              setSelectedCustomer(null);
              setIsReportModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 border border-amber-700 py-4 font-bold text-white shadow-lg hover:bg-amber-700 active:scale-95 transition-all text-sm mb-2"
          >
            <FileText className="h-5 w-5" /> 領収書登録
          </button>
          <div className="relative group">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="顧客名やアレルギー情報を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {cities.map(city => (
              <button
                key={city}
                onClick={() => setSelectedCity(city)}
                className={cn(
                  "whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all",
                  selectedCity === city
                    ? "bg-slate-900 text-white shadow-md shadow-slate-200"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                )}
              >
                {city}
              </button>
            ))}
          </div>
        </div>

        {/* Customer List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">登録顧客一覧</h2>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-100">{filteredCustomers.length}件</span>
          </div>
          {filteredCustomers.map(customer => (
            <motion.div
              layout
              key={customer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setSelectedCustomer(customer)}
              className="group flex cursor-pointer items-center justify-between rounded-xl bg-white p-5 shadow-sm border border-slate-200 transition-all hover:bg-blue-50/10 hover:border-blue-200 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-slate-50 p-3 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors border border-slate-100 group-hover:border-blue-200">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{customer.name}</h3>
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                    <MapPin className="h-3 w-3 text-slate-300" /> {customer.address}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {customer.family?.some(f => f.allergy !== "なし") && (
                  <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-100">アレルギーあり</span>
                )}
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </div>
            </motion.div>
          ))}
          {filteredCustomers.length === 0 && (
            <div className="py-24 text-center">
              <p className="text-slate-400 text-sm font-medium">該当する顧客が見つかりません</p>
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Button for standalone receipt */}
      <div className="fixed bottom-8 right-8 z-40">
        <button 
          onClick={() => {
            setSelectedCustomer(null);
            setIsReportModalOpen(true);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xl shadow-blue-200 transition-all hover:bg-blue-700 hover:rotate-90 active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedCustomer && !isReportModalOpen && !isHistoryModalOpen && (
          <CustomerDetailModal 
            customer={selectedCustomer} 
            onClose={() => setSelectedCustomer(null)}
            onNewReport={() => setIsReportModalOpen(true)}
            onViewHistory={() => setIsHistoryModalOpen(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isReportModalOpen) && (
          <ReportModal 
            customer={selectedCustomer}
            onClose={() => setIsReportModalOpen(false)}
            user={user}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryModalOpen && selectedCustomer && (
          <HistoryModal 
            customer={selectedCustomer}
            onClose={() => setIsHistoryModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function CustomerDetailModal({ customer, onClose, onNewReport, onViewHistory }: { customer: Customer, onClose: () => void, onNewReport: () => void, onViewHistory: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm px-4 sm:items-center"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: "100%", scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: "100%", scale: 0.98 }}
        className="w-full max-w-md rounded-t-2xl bg-white p-6 pb-12 shadow-2xl sm:rounded-2xl sm:pb-6 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-xl ring-1 ring-blue-200">
              {customer.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{customer.name}</h2>
              <p className="text-xs text-slate-500 font-medium">{customer.address}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">&times;</button>
        </div>

        <div className="mb-8 space-y-8 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
          {/* Family Section */}
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">ご家族情報</h3>
            <div className="space-y-2">
              {customer.family?.map((f, i) => (
                <div key={i} className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-lg border border-slate-100 shadow-sm transition-all hover:bg-slate-100/50">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800 leading-none">{f.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{f.dob}</p>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold border",
                      f.allergy !== "なし" 
                        ? "bg-red-50 text-red-700 border-red-100" 
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    )}>
                      {f.allergy === "なし" ? "アレルギー: なし" : f.allergy}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Details Section */}
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">基本詳細</h3>
            <div className="space-y-1">
              {Object.entries(customer.details).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-2.5 px-1 border-b border-slate-50 text-sm">
                  <span className="text-slate-400 font-medium">{k}</span>
                  <span className="font-bold text-slate-700">{v}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <button 
            onClick={onViewHistory}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-3 font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
          >
            <History className="h-4 w-4" />
            活動記録
          </button>
          <button 
            onClick={onNewReport}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            日報作成
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReportModal({ customer, onClose, user }: { customer: Customer | null, onClose: () => void, user: any }) {
  const [reportType, setReportType] = useState<'daily' | 'accident'>('daily');
  const [inputText, setInputText] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);
  const [riskRating, setRiskRating] = useState(4);
  const [esRating, setEsRating] = useState(4);
  const [images, setImages] = useState<{file: File, url: string, amount: number, store: string, date: string, ocrReady: boolean}[]>([]);
  const [unregisteredCustomerName, setUnregisteredCustomerName] = useState("");
  const [handoffText, setHandoffText] = useState("");
  const [isSavingReceipts, setIsSavingReceipts] = useState(false);

  const handleSaveReceiptsOnly = async () => {
    if (images.length === 0) {
      alert("画像がアップロードされていません。");
      return;
    }
    setIsSavingReceipts(true);
    try {
      for (const img of images) {
        await saveReceipt({
          reportId: "standalone",
          customerId: "standalone",
          customerName: unregisteredCustomerName || "顧客指定なし",
          staffId: user.uid,
          staffName: user.displayName || "Unknown",
          amount: img.amount,
          storeName: img.store,
          receiptDate: img.date || format(new Date(), "yyyy/MM/dd HH:mm"),
          imageUrl: img.url,
          handoffText: handoffText,
          timestamp: null
        });
      }
      alert("領収書を登録しました。");
      onClose();
      setImages([]);
      setUnregisteredCustomerName("");
      setHandoffText("");
    } catch (error) {
      console.error("Save Receipts Error", error);
      alert("領収書の保存に失敗しました。");
    } finally {
      setIsSavingReceipts(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("このブラウザは音声入力に対応していません。");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInputText(prev => prev + (prev ? "\n" : "") + text);
    };
    recognition.start();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(async file => {
      const url = URL.createObjectURL(file);
      const newImg = { file, url, amount: 0, store: "", date: "", ocrReady: false };
      setImages(prev => [...prev, newImg]);

      // OCR
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const ocr = await extractReceiptInfo(base64);
          setImages(prev => prev.map(img => img.url === url ? { ...img, amount: ocr.amount, store: ocr.storeName, date: ocr.receiptDate, ocrReady: true } : img));
        } catch (error) {
          console.error("OCR Error", error);
          setImages(prev => prev.map(img => img.url === url ? { ...img, ocrReady: true } : img));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    try {
      const timeInfo = reportType === 'daily' ? `${startTime}〜${endTime}` : startTime;
      const res = reportType === 'daily' 
        ? await generateDailyReport(inputText, timeInfo) 
        : await generateAccidentReport(inputText, timeInfo);
      setGeneratedReport(res);
    } catch (error) {
      console.error("Generation Error", error);
      alert("レポートの生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedReport) return;
    try {
      const reportDate = format(new Date(), "yyyy/MM/dd");
      const reportId = await saveReport({
        type: reportType,
        timestamp: null, 
        reporterId: user.uid,
        reporterName: user.displayName || "Unknown",
        customerId: customer?.id || "standalone",
        customerName: customer?.name || "顧客指定なし",
        reportDate,
        content: {
          ...generatedReport,
          original: inputText
        },
        riskRating: reportType === 'daily' ? (riskRating || 0) : 0,
        esRating: reportType === 'daily' ? (esRating || 0) : 0,
      });
 
      // Save receipts
      for (const img of images) {
        await saveReceipt({
          reportId, 
          customerId: customer?.id,
          staffId: user.uid,
          staffName: user.displayName || "Unknown",
          amount: img.amount,
          storeName: img.store,
          receiptDate: img.date,
          imageUrl: img.url,
          handoffText: "",
          timestamp: null
        });
      }

      onClose();
      setGeneratedReport(null);
      setImages([]);
      setInputText("");
      setRiskRating(4);
      setEsRating(4);
    } catch (error) {
      console.error("Save Error", error);
      alert("保存に失敗しました。");
    }
  };

  if (customer === null) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:p-4"
      >
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="flex w-full max-w-2xl flex-col bg-white shadow-2xl sm:rounded-3xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4 shrink-0">
            <div className="flex gap-2 items-center text-amber-600">
              <Camera className="h-5 w-5" />
              <span className="text-sm font-bold text-slate-800">各種経費の領収書登録</span>
            </div>
            <button onClick={onClose} className="rounded-lg bg-white border border-slate-200 p-2 text-slate-400 font-bold hover:bg-slate-50 transition-colors">&times;</button>
          </div>

          <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* Header Info */}
            <div className="rounded-xl bg-slate-900 p-5 text-white shadow-xl shadow-slate-200 flex justify-between items-center ring-1 ring-slate-800">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">対象</p>
                <h4 className="font-bold text-lg leading-none">各種経費の領収書を登録します</h4>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">日付</p>
                <h4 className="font-bold font-mono leading-none">{format(new Date(), "yyyy/MM/dd")}</h4>
              </div>
            </div>

            {/* Unregistered Customer Name */}
            <div>
              <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">未登録顧客名（空白で顧客指定なし）</label>
              <input 
                type="text" 
                placeholder="例: 山田 花子"
                value={unregisteredCustomerName}
                onChange={(e) => setUnregisteredCustomerName(e.target.value)}
                className="w-full rounded-xl border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all" 
              />
            </div>

            {/* Receipts Upload Section (At the very top of body!) */}
            <div>
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  領収書 (最大6枚)
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-all hover:bg-slate-50 shadow-sm active:scale-95">
                  <Camera className="h-3 w-3" /> 画像を追加
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                {images.map((img, i) => (
                  <div key={i} className="relative w-28 group">
                    <div className="relative h-24 w-28 overflow-hidden rounded-xl bg-slate-100 shadow-sm border border-slate-200">
                      <img src={img.url} className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                      {!img.ocrReady && <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
                      <button 
                        onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-100 transition-opacity z-10"
                      >&times;</button>
                    </div>
                    {img.ocrReady && (
                      <div className="mt-2 space-y-1">
                        <input 
                          type="number" 
                          value={img.amount} 
                          onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, amount: parseInt(e.target.value) || 0 } : im))}
                          className="w-full text-[10px] p-1 border rounded"
                          placeholder="金額"
                        />
                        <input 
                          type="text" 
                          placeholder="店名/内容"
                          value={img.store} 
                          onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, store: e.target.value } : im))}
                          className="w-full text-[10px] p-1 border rounded"
                        />
                        <input 
                          type="text" 
                          placeholder="領収日時"
                          value={img.date || ""} 
                          onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, date: e.target.value } : im))}
                          className="w-full text-[10px] p-1 border rounded"
                        />
                      </div>
                    )}
                  </div>
                ))}
                {images.length === 0 && (
                  <div className="w-full py-8 border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center text-slate-300 text-xs font-medium">画像がアップロードされていません</div>
                )}
              </div>
            </div>

            {/* Handoff Section */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">申し送り</label>
              <textarea
                rows={3}
                value={handoffText}
                onChange={(e) => setHandoffText(e.target.value)}
                placeholder="領収書に関する申し送り事項があれば入力"
                className="w-full rounded-xl border-slate-200 bg-white p-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 transition-all resize-none leading-relaxed"
              />
            </div>
          </div>

          {images.length > 0 && (
            <div className="border-t border-slate-100 p-6 bg-slate-50/50">
              <button 
                onClick={handleSaveReceiptsOnly}
                disabled={isSavingReceipts}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-amber-600 hover:bg-amber-700 py-4 font-bold text-white shadow-xl shadow-slate-200 active:scale-95 transition-all text-sm tracking-tight disabled:opacity-50"
              >
                <CheckCircle2 className="h-5 w-5" />
                {isSavingReceipts ? "登録中..." : "領収書を登録する"}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:p-4"
    >
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="flex w-full max-w-2xl flex-col bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4 shrink-0">
          <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
            <button 
              onClick={() => { setReportType('daily'); setGeneratedReport(null); }}
              className={cn("rounded-md px-4 py-1.5 text-xs font-bold transition-all uppercase tracking-wider", reportType === 'daily' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
            >
              保育日報
            </button>
            <button 
              onClick={() => { setReportType('accident'); setGeneratedReport(null); }}
              className={cn("rounded-md px-4 py-1.5 text-xs font-bold transition-all uppercase tracking-wider", reportType === 'accident' ? "bg-white text-red-600 shadow-sm" : "text-slate-500")}
            >
              事故報告
            </button>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white border border-slate-200 p-2 text-slate-400 font-bold hover:bg-slate-50 transition-colors">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Header Info */}
          <div className="rounded-xl bg-slate-900 p-5 text-white shadow-xl shadow-slate-200 flex justify-between items-center ring-1 ring-slate-800">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">対象顧客</p>
              <h4 className="font-bold text-lg leading-none">{customer ? customer.name : "顧客指定なし"}</h4>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">日付</p>
              <h4 className="font-bold font-mono leading-none">{format(new Date(), "yyyy/MM/dd")}</h4>
            </div>
          </div>

          {/* Child Selector for Accident Report */}
          {reportType === 'accident' && customer && customer.family && customer.family.length > 0 && (
            <div>
              <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">対象のお子様</label>
              <select 
                className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"
                onChange={(e) => {
                  const child = customer.family!.find(f => f.name === e.target.value);
                  if (child) {
                    setInputText(prev => `対象者: ${child.name} (${child.dob})\n` + prev);
                  }
                }}
              >
                <option value="">選択してください</option>
                {customer.family.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Time Selector */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">開始 / 発生</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all" 
              />
            </div>
            {reportType === 'daily' && (
              <div>
                <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">終了時間</label>
                <input 
                  type="time" 
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border-slate-200 bg-slate-50 p-3 text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all" 
                />
              </div>
            )}
          </div>

          {/* Input Text */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">メモ（内容）</label>
                <button 
                  onClick={handleVoiceInput}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-md shadow-slate-200"
                >
                  <Mic className="h-3 w-3" /> 音声入力
                </button>
            </div>
            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="今日あったことをそのまま入力してください..."
              className="w-full rounded-xl border-slate-200 bg-white p-4 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Images / Receipts */}
          <div>
             <div className="mb-3 flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {reportType === 'daily' ? '領収書 (最大6枚)' : '状況写真 (最大6枚)'}
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 transition-all hover:bg-slate-50 shadow-sm active:scale-95">
                <Camera className="h-3 w-3" /> 画像を追加
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              {images.map((img, i) => (
                <div key={i} className="relative w-28 group">
                  <div className="relative h-24 w-28 overflow-hidden rounded-xl bg-slate-100 shadow-sm border border-slate-200">
                    <img src={img.url} className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                    {!img.ocrReady && <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
                    <button 
                      onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >&times;</button>
                  </div>
                  {img.ocrReady && reportType === 'daily' && (
                    <div className="mt-2 space-y-1">
                      <input 
                        type="number" 
                        value={img.amount} 
                        onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, amount: parseInt(e.target.value) || 0 } : im))}
                        className="w-full text-[10px] p-1 border rounded"
                        placeholder="金額"
                      />
                      <input 
                        type="text" 
                        placeholder="店名/内容"
                        value={img.store} 
                        onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, store: e.target.value } : im))}
                        className="w-full text-[10px] p-1 border rounded"
                      />
                      <input 
                        type="text" 
                        placeholder="領収日時"
                        value={img.date || ""} 
                        onChange={e => setImages(prev => prev.map((im, idx) => idx === i ? { ...im, date: e.target.value } : im))}
                        className="w-full text-[10px] p-1 border rounded"
                      />
                    </div>
                  )}
                </div>
              ))}
              {images.length === 0 && (
                <div className="w-full py-8 border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center text-slate-300 text-xs font-medium">画像がアップロードされていません</div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !inputText.trim()}
            className={cn(
              "w-full rounded-xl py-4 font-bold text-white shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest text-xs",
              reportType === 'daily' ? "bg-blue-600 shadow-blue-100 hover:bg-blue-700" : "bg-red-600 shadow-red-100 hover:bg-red-700",
              (isGenerating || !inputText.trim()) && "opacity-50 cursor-not-allowed grayscale"
            )}
          >
            {isGenerating ? "分析中..." : reportType === 'daily' ? "日報案を作成する" : "事故報告書案を作成する"}
          </button>

          {/* Results Area */}
          {generatedReport && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 pt-8 border-t border-slate-100"
            >
              {reportType === 'daily' && (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">PSI (安全性評価)</label>
                      <div className="flex gap-1.5">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} onClick={() => setRiskRating(s)} className={cn("h-8 w-8 rounded-lg text-xs font-bold transition-all", riskRating === s ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "bg-slate-100 text-slate-400 hover:bg-slate-200")}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">ES (満足度)</label>
                      <div className="flex gap-1.5">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} onClick={() => setEsRating(s)} className={cn("h-8 w-8 rounded-lg text-xs font-bold transition-all", esRating === s ? "bg-slate-900 text-white shadow-md shadow-slate-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200")}>{s}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {generatedReport.warnings?.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-4 border border-amber-100 flex gap-3 items-start">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">注意喚起</p>
                        <p className="text-[11px] text-amber-600 font-medium">{generatedReport.warnings.join(", ")}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between border-b border-slate-50 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">社内向け日報</span>
                        </div>
                      </div>
                      <textarea 
                        className="w-full text-sm leading-relaxed text-slate-700 whitespace-pre-wrap border-none p-0 focus:ring-0 min-h-[100px]"
                        value={generatedReport.internal}
                        onChange={(e) => setGeneratedReport({...generatedReport, internal: e.target.value})}
                      />
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between border-b border-slate-50 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">保護者へのLINE/メール案</span>
                        </div>
                        <button 
                          onClick={() => navigator.clipboard.writeText(generatedReport.customer)}
                          className="px-2 py-1 bg-slate-50 text-[9px] font-bold text-slate-500 rounded border border-slate-200 hover:bg-slate-100 transition-colors uppercase tracking-wider"
                        >コピー</button>
                      </div>
                      <textarea 
                        className="w-full text-sm leading-relaxed text-slate-700 whitespace-pre-wrap border-none p-0 focus:ring-0 min-h-[100px]"
                        value={generatedReport.customer}
                        onChange={(e) => setGeneratedReport({...generatedReport, customer: e.target.value})}
                      />
                    </div>
                  </div>
                </>
              )}

              {reportType === 'accident' && (
                <div className="space-y-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">事故報告書ドラフト</h3>
                  <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                    {Object.entries(generatedReport).map(([k, v]) => (
                      <div key={k} className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">{k}</label>
                        <textarea 
                           className="w-full rounded-lg bg-slate-50 p-4 text-xs font-medium text-slate-700 border border-slate-100 leading-relaxed focus:bg-white transition-all shadow-sm min-h-[60px]"
                          value={v as string}
                          onChange={(e) => setGeneratedReport({...generatedReport, [k]: e.target.value})}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {(generatedReport || images.length > 0) && (
          <div className="border-t border-slate-100 p-6 bg-slate-50/50">
            <button 
              onClick={handleSave}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 py-4 font-bold text-white shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all text-sm tracking-tight"
            >
              <CheckCircle2 className="h-5 w-5" />
              報告データを保存する
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function HistoryModal({ customer, onClose }: { customer: Customer, onClose: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getCustomerReports(customer.id);
      setReports(data);
      setLoading(false);
    }
    load();
  }, [customer]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="flex w-full max-w-2xl flex-col bg-white shadow-2xl sm:rounded-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-slate-50 rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">活動記録タイムライン</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{customer.name} の過去の記録</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white border border-slate-200 p-2 text-slate-400 font-bold hover:bg-slate-50 transition-colors">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar pb-20">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-400 animate-pulse font-bold tracking-widest text-xs uppercase">データを取得中...</div>
          ) : reports.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-slate-300 gap-2">
              <History className="h-8 w-8 opacity-20" />
              <p className="text-xs font-bold uppercase tracking-widest">記録が見つかりません</p>
            </div>
          ) : (
            reports.map((report, i) => (
              <ReportCard key={report.id} report={report} index={i} />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReportCard({ report, index }: { report: any, index: number }) {
  const [activeTab, setActiveTab] = useState<'internal' | 'customer' | 'original'>('internal');

  const content = report.content || {};
  const displayContent = activeTab === 'internal' ? content.internal : 
                         activeTab === 'customer' ? content.customer : 
                         content.original;

  return (
    <div className="relative pl-10 pb-8 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-0 top-3 bottom-0 w-1 bg-slate-100 rounded-full" />
      <div className={cn(
        "absolute left-[-6px] top-3 h-4 w-4 rounded-full ring-4 ring-white shadow-sm z-10",
        report.type === 'daily' ? "bg-blue-600" : "bg-red-600"
      )} />
      
      <motion.div 
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-50"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-50 pb-3">
          <div className="flex items-center gap-3">
            <span className={cn(
              "rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white shadow-sm",
              report.type === 'daily' ? "bg-blue-600" : "bg-red-600"
            )}>
              {report.type === 'daily' ? "日報" : "例外"}
            </span>
            <span className="text-xs font-bold text-slate-900 font-mono tracking-tighter">{report.reportDate}</span>
          </div>
          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
            {report.reporterName}
          </div>
        </div>

        {report.type === 'daily' ? (
          <div className="space-y-4">
            {/* View Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              <button 
                onClick={() => setActiveTab('internal')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                  activeTab === 'internal' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                社内向け
              </button>
              <button 
                onClick={() => setActiveTab('customer')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                  activeTab === 'customer' ? "bg-white text-green-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                顧客向け
              </button>
              {content.original && (
                <button 
                  onClick={() => setActiveTab('original')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                    activeTab === 'original' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  オリジナル
                </button>
              )}
            </div>

            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
              {displayContent || "データなし"}
            </div>

            {(report.riskRating || report.esRating) !== undefined && (
              <div className="flex gap-4 border-t border-slate-50 pt-4">
                <div className="px-3 py-1 bg-blue-50 text-[10px] font-bold text-blue-700 rounded-full border border-blue-100 uppercase tracking-widest">PSI {report.riskRating}</div>
                <div className="px-3 py-1 bg-slate-900 text-[10px] font-bold text-white rounded-full uppercase tracking-widest">ES {report.esRating}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="font-bold text-red-700 text-sm tracking-tight mb-2">事故/トラブル報告</div>
             {/* Simple toggle for accident reports if original memo exists */}
             {content.original && (
               <div className="flex gap-1 mb-2">
                 <button 
                   onClick={() => setActiveTab('internal')}
                   className={cn("px-2 py-0.5 text-[9px] font-bold rounded", activeTab === 'internal' ? "bg-red-50 text-red-600" : "text-slate-400")}
                 >報告書</button>
                 <button 
                   onClick={() => setActiveTab('original')}
                   className={cn("px-2 py-0.5 text-[9px] font-bold rounded", activeTab === 'original' ? "bg-slate-900 text-white" : "text-slate-400")}
                 >メモ</button>
               </div>
             )}

            {activeTab === 'original' ? (
              <div className="text-xs text-slate-600 italic bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap">{content.original}</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(content).map(([key, value]) => {
                  if (key === 'original' || key === 'warnings') return null;
                  return (
                    <div key={key} className="space-y-1">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                        {key === 'situation' ? '発生状況' : 
                         key === 'cause' ? '原因' : 
                         key === 'response' ? '対応' : 
                         key === 'assessment' ? 'アセスメント' : 
                         key === 'nextSteps' ? '今後の対策' : key}
                      </span>
                      <div className="text-xs text-slate-700 bg-slate-50/50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                        {value as string}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Images in history panel */}
        <ImageHistory reportId={report.id} />
      </motion.div>
    </div>
  );
}

function ImageHistory({ reportId }: { reportId: string }) {
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "receipts"),
      where("reportId", "==", reportId)
    );
    return onSnapshot(q, (snapshot) => {
      setImages(snapshot.docs.map(doc => doc.data()));
    });
  }, [reportId]);

  if (images.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {images.map((img, i) => (
        <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 shadow-sm border border-slate-100 cursor-pointer" onClick={() => window.open(img.imageUrl, '_blank')}>
          <img 
            src={img.imageUrl} 
            className="h-full w-full object-cover transition-transform group-hover:scale-125" 
          />
          {img.amount > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-slate-900/60 px-1 py-0.5 text-[8px] font-bold text-white backdrop-blur-[2px] truncate">
              ¥{img.amount.toLocaleString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
