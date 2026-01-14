
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Transaction, TransactionType, User, UserRole } from './types';
import { INITIAL_CATEGORIES, STORAGE_KEY } from './constants';
import Scanner from './components/Scanner';
import { db } from './firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

declare var JsBarcode: any;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'settings'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [currentUser, setCurrentUser] = useState<User | null>({ 
    id: '1', name: 'Admin Gudang', username: 'admin', role: UserRole.ADMIN 
  });
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scanMode, setScanMode] = useState<TransactionType | null>(null);
  const [lastScanMessage, setLastScanMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const barcodeBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  // Firestore Real-time Subscriptions
  useEffect(() => {
    const qProducts = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(items);
    });

    const qTransactions = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(50));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          ...data, 
          id: doc.id,
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now()
        } as unknown as Transaction;
      });
      setTransactions(items);
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        setCategories(docSnap.data().categories || INITIAL_CATEGORIES);
      }
    });

    return () => {
      unsubProducts();
      unsubTransactions();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTransactionModalOpen || isProductModalOpen) return;
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const currentTime = Date.now();
      if (currentTime - lastKeyTime.current > 100) barcodeBuffer.current = '';
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 2) {
          if (isInput) e.preventDefault();
          handleScan(barcodeBuffer.current);
          barcodeBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, isTransactionModalOpen, isProductModalOpen, scanMode]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.phoneType.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'All' || p.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, filterCategory]);

  const lowStockProducts = products.filter(p => p.stock <= p.minStock);
  const totalStockValue = products.reduce((acc, p) => acc + p.stock, 0);

  const generateBarcodeSvg = (id: string, elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el && typeof JsBarcode === 'function') {
        JsBarcode(el, id, { format: "CODE128", width: 1.5, height: 30, displayValue: false, margin: 0 });
      }
    }, 0);
  };

  const handleScan = (code: string) => {
    const product = products.find(p => p.id === code);
    if (product) {
      if (scanMode) processAutoTransaction(product, scanMode);
      else {
        setSelectedProduct(product);
        setIsTransactionModalOpen(true);
        setIsScannerOpen(false);
      }
    } else {
      setLastScanMessage({ text: `SKU ${code} tidak ada!`, type: 'error' });
      setTimeout(() => setLastScanMessage(null), 3000);
      setSearchQuery(code);
    }
  };

  const processAutoTransaction = async (product: Product, type: TransactionType) => {
    if (type === TransactionType.OUT && product.stock <= 0) {
      setLastScanMessage({ text: `Stok Habis!`, type: 'error' });
      return;
    }

    try {
      const qtyChange = type === TransactionType.IN ? 1 : -1;
      await updateDoc(doc(db, "products", product.id), {
        stock: increment(qtyChange)
      });

      await addDoc(collection(db, "transactions"), {
        productId: product.id,
        productName: product.name,
        type,
        quantity: 1,
        note: 'Auto-scan',
        timestamp: serverTimestamp(),
        userName: currentUser?.name || 'System'
      });

      setLastScanMessage({ text: `${type === TransactionType.IN ? 'MASUK' : 'KELUAR'}: ${product.name}`, type: 'success' });
      setTimeout(() => setLastScanMessage(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const id = (formData.get('id') as string).trim() || `${Math.floor(10000000 + Math.random() * 90000000)}`;
    
    if (products.find(p => p.id === id)) {
      alert('SKU sudah ada!');
      return;
    }

    const newProduct = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      phoneType: formData.get('phoneType') as string,
      stock: parseInt(formData.get('stock') as string) || 0,
      minStock: parseInt(formData.get('minStock') as string) || 5,
      createdAt: Date.now()
    };

    await setDoc(doc(db, "products", id), newProduct);
    setIsProductModalOpen(false);
  };

  const handleTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const formData = new FormData(e.currentTarget);
    const type = formData.get('type') as TransactionType;
    const qty = parseInt(formData.get('quantity') as string);

    if (type === TransactionType.OUT && selectedProduct.stock < qty) {
      alert('Stok kurang!');
      return;
    }

    const qtyChange = type === TransactionType.IN ? qty : -qty;
    await updateDoc(doc(db, "products", selectedProduct.id), { stock: increment(qtyChange) });
    await addDoc(collection(db, "transactions"), {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      type,
      quantity: qty,
      note: formData.get('note') as string,
      timestamp: serverTimestamp(),
      userName: currentUser?.name || 'System'
    });

    setIsTransactionModalOpen(false);
    setSelectedProduct(null);
  };

  return (
    <div className="min-h-screen flex flex-col pb-24 md:pb-0 md:pt-24 bg-gray-50/50">
      {lastScanMessage && (
        <div className={`fixed top-28 left-1/2 -translate-x-1/2 z-[60] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-fadeIn ${lastScanMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
           <i className={`fas ${lastScanMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
           <span className="font-black text-sm uppercase tracking-tight">{lastScanMessage.text}</span>
        </div>
      )}

      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 h-24 z-40 px-8 hidden md:flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3"><i className="fas fa-cubes text-xl"></i></div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter leading-none">HISTOCK</h1>
            <p className="text-[10px] font-black text-gray-400 tracking-[0.2em] mt-1 uppercase">Warehouse Cloud</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl">
          <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition ${activeTab === 'dashboard' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}>Dashboard</button>
          <button onClick={() => setActiveTab('inventory')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition ${activeTab === 'inventory' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}>Inventori</button>
          <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition ${activeTab === 'history' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}>Riwayat</button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition ${activeTab === 'settings' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-black'}`}>Profil</button>
        </nav>
        <button onClick={() => setIsScannerOpen(true)} className="bg-black text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:scale-105 transition shadow-lg"><i className="fas fa-camera text-lg"></i></button>
      </header>

      <main className="flex-1 p-4 md:p-8 w-full max-w-6xl mx-auto overflow-y-auto">
        {activeTab === 'dashboard' && <DashboardView scanMode={scanMode} setScanMode={setScanMode} products={products} totalStockValue={totalStockValue} lowStockProducts={lowStockProducts} transactions={transactions} currentUser={currentUser} />}
        {activeTab === 'inventory' && <InventoryView products={products} filteredProducts={filteredProducts} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterCategory={filterCategory} setFilterCategory={setFilterCategory} categories={categories} currentUser={currentUser} setIsProductModalOpen={setIsProductModalOpen} setSelectedProduct={setSelectedProduct} setIsTransactionModalOpen={setIsTransactionModalOpen} toggleSelection={(id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])} selectedIds={selectedIds} generateBarcodeSvg={generateBarcodeSvg} />}
        {activeTab === 'history' && <HistoryView transactions={transactions} />}
        {activeTab === 'settings' && <SettingsView currentUser={currentUser} categories={categories} setCategories={async (newCats: string[]) => { await setDoc(doc(db, "settings", "general"), { categories: newCats }, { merge: true }); }} />}
      </main>

      <div className="fixed bottom-28 right-6 md:hidden z-40">
        <button onClick={() => setIsScannerOpen(true)} className="w-16 h-16 bg-black text-white rounded-full shadow-2xl flex items-center justify-center text-2xl active:scale-90 transition"><i className="fas fa-camera"></i></button>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 h-22 md:hidden flex items-center justify-around px-4 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] rounded-t-[40px]">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1.5 p-2 ${activeTab === 'dashboard' ? 'text-black' : 'text-gray-300'}`}><i className="fas fa-layer-group text-lg"></i><span className="text-[9px] font-black uppercase tracking-widest">Home</span></button>
        <button onClick={() => setActiveTab('inventory')} className={`flex flex-col items-center gap-1.5 p-2 ${activeTab === 'inventory' ? 'text-black' : 'text-gray-300'}`}><i className="fas fa-archive text-lg"></i><span className="text-[9px] font-black uppercase tracking-widest">Items</span></button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1.5 p-2 ${activeTab === 'history' ? 'text-black' : 'text-gray-300'}`}><i className="fas fa-clock-rotate-left text-lg"></i><span className="text-[9px] font-black uppercase tracking-widest">Logs</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1.5 p-2 ${activeTab === 'settings' ? 'text-black' : 'text-gray-300'}`}><i className="fas fa-user-gear text-lg"></i><span className="text-[9px] font-black uppercase tracking-widest">Self</span></button>
      </nav>

      {isScannerOpen && <Scanner onDetected={handleScan} onClose={() => setIsScannerOpen(false)} />}
      
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center">
              <h3 className="text-2xl font-black">Tambah Produk</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-8 space-y-4">
              <input required name="name" type="text" placeholder="Nama Produk" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
              <input name="id" type="text" placeholder="SKU/Barcode (ID Manual)" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
              <input required name="phoneType" type="text" placeholder="Tipe HP" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
              <select name="category" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input required name="stock" type="number" placeholder="Stok Awal" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
                <input required name="minStock" type="number" defaultValue="5" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
              </div>
              <button type="submit" className="w-full bg-black text-white py-5 rounded-[24px] font-black text-sm uppercase tracking-widest">Simpan Produk</button>
            </form>
          </div>
        </div>
      )}

      {isTransactionModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <div><h3 className="text-xl font-black">Update Stok</h3><p className="text-gray-400 text-xs font-bold uppercase">{selectedProduct.name}</p></div>
              <button onClick={() => { setIsTransactionModalOpen(false); setSelectedProduct(null); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center"><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleTransaction} className="p-8 space-y-6">
              <div className="flex p-1.5 bg-gray-100 rounded-[20px]">
                <label className="flex-1"><input type="radio" name="type" value={TransactionType.IN} defaultChecked className="hidden peer" /><div className="py-3 text-center rounded-[14px] cursor-pointer peer-checked:bg-white peer-checked:text-black font-black text-[10px] uppercase transition-all">Masuk</div></label>
                <label className="flex-1"><input type="radio" name="type" value={TransactionType.OUT} className="hidden peer" /><div className="py-3 text-center rounded-[14px] cursor-pointer peer-checked:bg-white peer-checked:text-black font-black text-[10px] uppercase transition-all">Keluar</div></label>
              </div>
              <div className="text-center py-6">
                <input required autoFocus name="quantity" type="number" min="1" defaultValue="1" className="w-full bg-transparent border-none text-6xl font-black text-center outline-none" />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Sisa: {selectedProduct.stock} pcs</p>
              </div>
              <input name="note" type="text" placeholder="Catatan" className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 outline-none" />
              <button type="submit" className="w-full bg-black text-white py-5 rounded-[24px] font-black text-sm uppercase tracking-widest">Simpan</button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-slideUp { animation: slideUp 0.4s ease-out; }
      `}</style>
    </div>
  );
};

const DashboardView = ({ scanMode, setScanMode, products, totalStockValue, lowStockProducts, transactions, currentUser }: any) => (
  <div className="space-y-6 animate-fadeIn">
    <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-tight">Mode Scan Cepat</h2>
        <div className="flex items-center gap-2">
           <span className={`w-2 h-2 rounded-full ${scanMode ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{scanMode ? 'Cloud Sync Aktif' : 'Manual'}</span>
        </div>
      </div>
      <div className="flex p-1.5 bg-gray-100 rounded-2xl">
        <button onClick={() => setScanMode(null)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition ${!scanMode ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>Manual</button>
        <button onClick={() => setScanMode(TransactionType.IN)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition ${scanMode === TransactionType.IN ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400'}`}>Masuk (+1)</button>
        <button onClick={() => setScanMode(TransactionType.OUT)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition ${scanMode === TransactionType.OUT ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400'}`}>Keluar (-1)</button>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-gray-400 text-[10px] uppercase font-bold">Total SKU</p>
        <p className="text-3xl font-black mt-1">{products.length}</p>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-gray-400 text-[10px] uppercase font-bold">Item Fisik</p>
        <p className="text-3xl font-black mt-1">{totalStockValue}</p>
      </div>
      <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
        <p className="text-red-500 text-[10px] uppercase font-bold">Min Stok</p>
        <p className="text-3xl font-black text-red-600 mt-1">{lowStockProducts.length}</p>
      </div>
      <div className="bg-black p-5 rounded-2xl text-white shadow-xl">
        <p className="text-gray-400 text-[10px] uppercase font-bold">User</p>
        <p className="text-xl font-bold mt-1 truncate">{currentUser?.name}</p>
      </div>
    </div>
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-black text-lg mb-6">⚠️ Stok Kritis</h3>
        <div className="space-y-4">
          {lowStockProducts.slice(0, 5).map((p: any) => (
            <div key={p.id} className="flex justify-between items-center"><p className="font-bold text-sm">{p.name}</p><p className="text-sm font-black text-red-600">{p.stock} pcs</p></div>
          ))}
          {lowStockProducts.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aman.</p>}
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-black text-lg mb-6">🔄 Cloud Activity</h3>
        <div className="space-y-4">
          {transactions.slice(0, 5).map((t: any) => (
            <div key={t.id} className="flex justify-between items-center text-sm">
              <p className="font-bold truncate max-w-[150px]">{t.productName}</p>
              <p className={`font-black ${t.type === TransactionType.IN ? 'text-green-600' : 'text-red-600'}`}>{t.type === TransactionType.IN ? '+' : '-'}{t.quantity}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const InventoryView = ({ products, filteredProducts, searchQuery, setSearchQuery, filterCategory, setFilterCategory, categories, currentUser, setIsProductModalOpen, setSelectedProduct, setIsTransactionModalOpen, toggleSelection, selectedIds, generateBarcodeSvg }: any) => (
  <div className="space-y-4 animate-fadeIn max-w-5xl mx-auto">
    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-3">
      <input type="text" placeholder="Search product..." className="flex-1 pl-4 pr-4 py-2.5 rounded-xl bg-gray-50 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      <div className="flex gap-2">
        <select className="flex-1 md:w-48 px-4 py-2.5 rounded-xl bg-gray-50 outline-none font-bold" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="All">Semua</option>
          {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
        {currentUser?.role === UserRole.ADMIN && (
          <button onClick={() => setIsProductModalOpen(true)} className="bg-black text-white px-5 py-2.5 rounded-xl font-bold"><i className="fas fa-plus"></i></button>
        )}
      </div>
    </div>
    <div className="space-y-2">
      {filteredProducts.map((p: any) => {
        const barcodeId = `barcode-${p.id}`;
        generateBarcodeSvg(p.id, barcodeId);
        return (
          <div key={p.id} className={`bg-white p-4 rounded-2xl border flex items-center gap-4 ${selectedIds.includes(p.id) ? 'border-black' : 'border-gray-100'}`}>
            <div className="flex-1">
              <p className="text-[9px] font-black text-gray-400 uppercase">{p.category} • {p.id}</p>
              <h4 className="font-bold text-base">{p.name}</h4>
              <p className="text-xs text-gray-500">{p.phoneType}</p>
            </div>
            <div className="hidden lg:block"><svg id={barcodeId}></svg></div>
            <div className="text-right">
              <p className={`text-xl font-black ${p.stock <= p.minStock ? 'text-red-600' : 'text-black'}`}>{p.stock}</p>
              <button onClick={() => { setSelectedProduct(p); setIsTransactionModalOpen(true); }} className="mt-1 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center"><i className="fas fa-exchange-alt text-xs"></i></button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const HistoryView = ({ transactions }: any) => (
  <div className="max-w-5xl mx-auto bg-white rounded-3xl p-6 border border-gray-100 shadow-sm animate-fadeIn">
    <h3 className="font-black text-xl mb-6">Cloud Logs</h3>
    {transactions.map((t: any) => (
      <div key={t.id} className="py-3 border-b border-gray-50 flex justify-between text-sm">
        <div><p className="font-bold">{t.productName}</p><p className="text-xs text-gray-400">{t.userName} • {t.note}</p></div>
        <div className={`font-black ${t.type === TransactionType.IN ? 'text-green-600' : 'text-red-600'}`}>{t.type === TransactionType.IN ? '+' : '-'}{t.quantity}</div>
      </div>
    ))}
  </div>
);

const SettingsView = ({ currentUser, categories, setCategories }: any) => (
  <div className="max-w-xl mx-auto space-y-6 animate-fadeIn">
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
      <div className="w-24 h-24 bg-black rounded-3xl flex items-center justify-center text-3xl font-black text-white mx-auto mb-4">{currentUser?.name?.charAt(0) || 'U'}</div>
      <h3 className="font-black text-2xl mb-1">{currentUser?.name}</h3>
      <p className="text-gray-400 text-xs font-black uppercase">{currentUser?.role}</p>
    </div>
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <h3 className="font-black text-lg mb-4">Categories</h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map((c: string) => (
          <span key={c} className="bg-gray-100 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">
            {c}
            <button onClick={() => setCategories(categories.filter((x: string) => x !== c))} className="text-red-500"><i className="fas fa-times-circle"></i></button>
          </span>
        ))}
      </div>
      <form onSubmit={(e: any) => { e.preventDefault(); const val = new FormData(e.currentTarget).get('cat') as string; if (val) setCategories([...categories, val]); e.currentTarget.reset(); }} className="flex gap-2">
        <input name="cat" type="text" placeholder="Add..." className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-sm outline-none" />
        <button type="submit" className="bg-black text-white px-6 py-3 rounded-xl font-bold">Add</button>
      </form>
    </div>
  </div>
);

export default App;
