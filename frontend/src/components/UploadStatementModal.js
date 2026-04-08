import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, AlertTriangle, Check, Sparkles, Loader2, Trash2, CheckSquare, Square, Zap, ArrowDownLeft, ArrowUpRight, Filter, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { api, formatINR } from '@/lib/api';
import { toast } from 'sonner';

const AMOUNT_FILTERS = [
  { label: 'All', value: 'all' },
  { label: '< ₹500', value: 'lt500' },
  { label: '₹500 - ₹2000', value: '500to2000' },
  { label: '> ₹2000', value: 'gt2000' },
];

const PROCESSING_STEPS = [
  { id: 'upload', label: 'File uploaded' },
  { id: 'extract', label: 'Extracting data from file' },
  { id: 'analyze', label: 'Analyzing with AI', aiOnly: true },
  { id: 'categorize', label: 'Processing transactions' },
  { id: 'mappings', label: 'Applying your saved preferences' },
];

function ProcessingProgress({ currentStep, fileName, isPdf, elapsedTime, useAI = false }) {
  // Filter steps based on whether AI is being used
  const visibleSteps = PROCESSING_STEPS.filter(step => {
    if (step.aiOnly && !useAI) return false;
    return true;
  });

  const stepIndex = visibleSteps.findIndex(s => s.id === currentStep);
  const progress = Math.min(((stepIndex + 1) / visibleSteps.length) * 100, 100);

  return (
    <div className="space-y-6 py-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#FDE047]/20 flex items-center justify-center">
          <Loader2 size={32} className="text-[#FDE047] animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Processing your statement</h3>
        <p className="text-sm text-[#A1A1AA]">{fileName}</p>
      </div>

      {/* Steps */}
      <div className="space-y-3 max-w-sm mx-auto">
        {visibleSteps.map((step, idx) => {
          // For CSV, skip PDF-specific steps
          if (!isPdf && step.id === 'extract') return null;

          const isCompleted = idx < stepIndex;
          const isCurrent = idx === stepIndex;
          const isPending = idx > stepIndex;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`flex items-center gap-3 ${isPending ? 'opacity-40' : ''}`}
            >
              {isCompleted ? (
                <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
              ) : isCurrent ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-5 h-5 rounded-full border-2 border-[#FDE047] border-t-transparent animate-spin flex-shrink-0"
                />
              ) : (
                <Circle size={20} className="text-[#A1A1AA]/50 flex-shrink-0" />
              )}
              <span className={`text-sm ${isCurrent ? 'text-white font-medium' : isCompleted ? 'text-green-400' : 'text-[#A1A1AA]'}`}>
                {step.label}
                {isCurrent && '...'}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="max-w-sm mx-auto">
        <div className="h-2 bg-white/[0.08] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#FDE047] to-[#F59E0B] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#A1A1AA]">
          <span>{Math.round(progress)}% complete</span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {elapsedTime}s elapsed
          </span>
        </div>
      </div>

      {/* Time estimate */}
      <div className="text-center">
        {isPdf ? (
          <p className="text-xs text-[#A1A1AA] flex items-center justify-center gap-2">
            <Sparkles size={12} className="text-[#FDE047]" />
            AI extraction usually takes 15-45 seconds
          </p>
        ) : (
          <p className="text-xs text-[#A1A1AA]">CSV processing is quick, almost done...</p>
        )}
        {elapsedTime > 30 && isPdf && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-amber-400 mt-2"
          >
            Taking longer than usual, please wait...
          </motion.p>
        )}
      </div>
    </div>
  );
}

export default function UploadStatementModal({ open, onOpenChange, categories, onSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [step, setStep] = useState('upload');
  const [useAI, setUseAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileType, setFileType] = useState(null);
  const [pdfConsent, setPdfConsent] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [autoAppliedCount, setAutoAppliedCount] = useState(0);
  const [amountFilter, setAmountFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'expense' | 'income'
  const [processingStep, setProcessingStep] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingWithAI, setProcessingWithAI] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  const resetState = () => {
    setFile(null);
    setTransactions([]);
    setStep('upload');
    setUseAI(false);
    setAiLoading(false);
    setFileType(null);
    setPdfConsent(false);
    setSelectedIndices(new Set());
    setBulkCategory('');
    setAutoAppliedCount(0);
    setAmountFilter('all');
    setTypeFilter('all');
    setProcessingStep(null);
    setElapsedTime(0);
    setProcessingWithAI(false);
    setPdfPassword('');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = async (selectedFile) => {
    const fileName = selectedFile.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isPDF = fileName.endsWith('.pdf');
    const isHTML = fileName.endsWith('.html') || fileName.endsWith('.htm');

    if (!isCSV && !isPDF && !isHTML) {
      toast.error('Only CSV, PDF, and HTML files are supported');
      return;
    }

    setFile(selectedFile);
    setFileType(isPDF ? 'pdf' : isHTML ? 'html' : 'csv');

    // All formats now processed locally first - no consent needed
    await processFile(selectedFile, false);
  };

  const processFile = async (selectedFile, useAI = false, password = null) => {
    setUploading(true);
    setStep('processing');
    setElapsedTime(0);
    setProcessingWithAI(useAI);

    // Start elapsed time counter
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');

    try {
      // Step 1: Upload
      setProcessingStep('upload');
      await new Promise(r => setTimeout(r, 500)); // Brief pause to show step

      // Step 2 & 3: Extract & Analyze
      if (isPdf) {
        setProcessingStep('extract');
        await new Promise(r => setTimeout(r, 400));
        if (useAI) {
          setProcessingStep('analyze');
        }
      }

      // Actually upload and process (include password if provided)
      const { data } = await api.uploadStatement(selectedFile, useAI, password || pdfPassword || null);
      let txns = data.transactions;

      // Step 4: Categorize
      setProcessingStep('categorize');
      await new Promise(r => setTimeout(r, 300));

      // Step 5: Apply mappings
      setProcessingStep('mappings');
      try {
        const mappingRes = await api.applyPayeeMappings(txns);
        txns = mappingRes.data.transactions;
        if (mappingRes.data.applied_count > 0) {
          setAutoAppliedCount(mappingRes.data.applied_count);
        }
      } catch (e) {
        console.log('No saved mappings or failed to apply');
      }

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setTransactions(txns);
      setStep('preview');
      setProcessingStep(null);

      const autoMsg = autoAppliedCount > 0 ? ` (${autoAppliedCount} auto-categorized)` : '';
      toast.success(`Found ${data.count} transactions${data.used_ai ? ' via AI' : ''}${autoMsg}`);
    } catch (err) {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const errorMsg = err.response?.data?.detail || 'Failed to parse file';

      // If PDF is password-protected, show password input
      if (isPdf && errorMsg.toLowerCase().includes('password')) {
        setStep('password-required');
        setProcessingStep(null);
        setUploading(false);
        return;
      }

      // If local PDF parsing failed, offer AI option
      if (isPdf && !useAI && errorMsg.includes('AI extraction')) {
        setStep('ai-fallback');
        setProcessingStep(null);
        setUploading(false);
        return;
      }

      toast.error(errorMsg);
      setFile(null);
      setStep('upload');
      setProcessingStep(null);
    } finally {
      setUploading(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePdfConsent = async () => {
    if (!pdfConsent) {
      toast.error('Please accept the data sharing consent to continue');
      return;
    }
    await processFile(file);
  };

  const handleAICategorize = async () => {
    if (!useAI) return;
    setAiLoading(true);
    try {
      const { data } = await api.categorizeTransactions(transactions);
      setTransactions(data.transactions);
      toast.success('Transactions categorized by AI');
    } catch (err) {
      toast.error('AI categorization failed');
    } finally {
      setAiLoading(false);
    }
  };

  const updateTransaction = (index, field, value) => {
    setTransactions(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: value, auto_categorized: false } : t
    ));
  };

  const toggleTransactionType = (index) => {
    setTransactions(prev => prev.map((t, i) => {
      if (i !== index) return t;
      const newType = t.type === 'expense' ? 'income' : 'expense';
      return {
        ...t,
        type: newType,
        category: newType === 'income' ? 'Income' : 'Uncategorized',
        auto_categorized: false
      };
    }));
  };

  const removeTransaction = (index) => {
    setTransactions(prev => prev.filter((_, i) => i !== index));
    setSelectedIndices(prev => {
      const newSet = new Set();
      prev.forEach(i => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t, idx) => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      // Amount filter
      if (amountFilter === 'lt500' && t.amount >= 500) return false;
      if (amountFilter === '500to2000' && (t.amount < 500 || t.amount > 2000)) return false;
      if (amountFilter === 'gt2000' && t.amount <= 2000) return false;

      return true;
    });
  }, [transactions, amountFilter, typeFilter]);

  // Get original indices for filtered transactions
  const filteredIndices = useMemo(() => {
    const indices = [];
    transactions.forEach((t, idx) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return;
      if (amountFilter === 'lt500' && t.amount >= 500) return;
      if (amountFilter === '500to2000' && (t.amount < 500 || t.amount > 2000)) return;
      if (amountFilter === 'gt2000' && t.amount <= 2000) return;
      indices.push(idx);
    });
    return indices;
  }, [transactions, amountFilter, typeFilter]);

  // Multi-select handlers
  const toggleSelect = (originalIndex) => {
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(originalIndex)) {
        newSet.delete(originalIndex);
      } else {
        newSet.add(originalIndex);
      }
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    const allFilteredSelected = filteredIndices.every(i => selectedIndices.has(i));
    if (allFilteredSelected) {
      setSelectedIndices(prev => {
        const newSet = new Set(prev);
        filteredIndices.forEach(i => newSet.delete(i));
        return newSet;
      });
    } else {
      setSelectedIndices(prev => {
        const newSet = new Set(prev);
        filteredIndices.forEach(i => newSet.add(i));
        return newSet;
      });
    }
  };

  const applyBulkCategory = () => {
    if (!bulkCategory || selectedIndices.size === 0) return;
    setTransactions(prev => prev.map((t, i) =>
      selectedIndices.has(i) ? { ...t, category: bulkCategory, auto_categorized: false } : t
    ));
    toast.success(`Applied "${bulkCategory}" to ${selectedIndices.size} transactions`);
    setSelectedIndices(new Set());
    setBulkCategory('');
  };

  const markSelectedAsIncome = () => {
    if (selectedIndices.size === 0) return;
    setTransactions(prev => prev.map((t, i) =>
      selectedIndices.has(i) ? { ...t, type: 'income', category: 'Income' } : t
    ));
    toast.success(`Marked ${selectedIndices.size} as income`);
    setSelectedIndices(new Set());
  };

  const removeSelected = () => {
    if (selectedIndices.size === 0) return;
    setTransactions(prev => prev.filter((_, i) => !selectedIndices.has(i)));
    toast.success(`Removed ${selectedIndices.size} transactions`);
    setSelectedIndices(new Set());
  };

  const handleImport = async () => {
    if (transactions.length === 0) return;
    setImporting(true);

    try {
      const expenses = transactions.map(t => ({
        amount: t.amount,
        category: t.category,
        description: t.description,
        date: t.date,
        type: t.type || 'expense'
      }));
      const { data } = await api.createBulkExpenses(expenses);
      const learnedMsg = data.learned_mappings > 0 ? ` (learned ${data.learned_mappings} payee mappings)` : '';
      toast.success(`Imported ${data.created} transactions${learnedMsg}`);
      handleClose();
      onSuccess?.();
    } catch (err) {
      toast.error('Failed to import');
    } finally {
      setImporting(false);
    }
  };

  const totalExpenses = transactions.filter(t => t.type !== 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseCount = transactions.filter(t => t.type !== 'income').length;
  const incomeCount = transactions.filter(t => t.type === 'income').length;
  const likelyCreditCount = transactions.filter(t => t.likely_credit && t.type !== 'income').length;
  const categoryOptions = categories.map(c => c.name);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#171717] border-white/10 text-white max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-['General_Sans'] flex items-center gap-2">
            <FileSpreadsheet size={22} className="text-[#FDE047]" />
            {step === 'upload' ? 'Upload Bank Statement' :
             step === 'password-required' ? 'Password Required' :
             step === 'consent' ? 'PDF Consent Required' : 'Review Transactions'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                dragActive ? 'border-[#FDE047] bg-[#FDE047]/10' : 'border-white/20 hover:border-white/40 hover:bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,.html,.htm"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={40} className="text-[#FDE047] animate-spin" />
                  <p className="text-[#A1A1AA]">Parsing file...</p>
                </div>
              ) : (
                <>
                  <Upload size={40} className={`mx-auto mb-4 ${dragActive ? 'text-[#FDE047]' : 'text-[#A1A1AA]'}`} />
                  <p className="text-white font-semibold mb-1">
                    {dragActive ? 'Drop file here' : 'Drag & drop your CSV, PDF, or HTML file'}
                  </p>
                  <p className="text-sm text-[#A1A1AA]">or click to browse</p>
                </>
              )}
            </div>

            <div className="glass-card-sm">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold text-[#A1A1AA] mb-2">Supported Formats (All Processed Locally)</p>
              <ul className="text-sm text-[#A1A1AA] space-y-1">
                <li className="flex items-center gap-2"><Check size={14} className="text-green-400" /> CSV - Bank exports</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-green-400" /> HTML - GPay, PhonePe exports</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-green-400" /> PDF - Bank statements</li>
              </ul>
              <p className="text-[10px] text-[#A1A1AA]/70 mt-2">100% private - no data sent externally. AI fallback available if needed.</p>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <ProcessingProgress
            currentStep={processingStep}
            fileName={file?.name}
            isPdf={fileType === 'pdf'}
            elapsedTime={elapsedTime}
            useAI={processingWithAI}
          />
        )}

        {step === 'ai-fallback' && (
          <div className="space-y-4 py-4">
            <div className="glass-card-sm border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Local parsing couldn't extract transactions</p>
                  <p className="text-sm text-[#A1A1AA]">{file?.name}</p>
                </div>
              </div>

              <p className="text-sm text-[#A1A1AA] mb-4">
                The PDF format wasn't recognized by our local parser. You can try AI-powered extraction which may work better with complex formats.
              </p>

              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] mb-4">
                <p className="font-semibold text-white text-sm mb-2">AI Extraction will:</p>
                <ul className="space-y-1 text-xs text-[#A1A1AA]">
                  <li>• Send your PDF content to OpenAI for processing</li>
                  <li>• Use GPT-4 to intelligently extract transactions</li>
                  <li>• Auto-categorize based on merchant names</li>
                </ul>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="ai-consent"
                  checked={pdfConsent}
                  onCheckedChange={setPdfConsent}
                  className="border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 mt-0.5"
                />
                <label htmlFor="ai-consent" className="text-sm text-white cursor-pointer">
                  I consent to sending my PDF to OpenAI for AI extraction
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep('upload'); setFile(null); setPdfConsent(false); }}
                className="text-sm text-[#A1A1AA] hover:text-white transition-colors"
              >
                Try Different File
              </button>
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className="px-4 py-2 rounded-full text-sm text-[#A1A1AA] hover:text-white">Cancel</button>
                <button
                  onClick={() => { if (pdfConsent) processFile(file, true); }}
                  disabled={!pdfConsent || uploading}
                  className="px-6 py-2 rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold text-sm hover:bg-[#FDE047]/90 disabled:opacity-50 flex items-center gap-2"
                >
                  <Sparkles size={16} /> Try AI Extraction
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'password-required' && (
          <div className="space-y-4 py-4">
            <div className="glass-card-sm border-blue-500/30 bg-blue-500/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <p className="font-semibold text-white">Password Protected PDF</p>
                  <p className="text-sm text-[#A1A1AA]">{file?.name}</p>
                </div>
              </div>

              <p className="text-sm text-[#A1A1AA] mb-4">
                This PDF is password-protected. Bank statements are often protected with a combination of your name and date of birth (e.g., GAURAV0115).
              </p>

              <div className="space-y-2">
                <label htmlFor="pdf-password" className="text-sm text-white font-medium">Enter PDF Password</label>
                <input
                  id="pdf-password"
                  type="password"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  placeholder="e.g., NAME0115 or DDMMYYYY"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder:text-[#A1A1AA] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pdfPassword) {
                      processFile(file, false, pdfPassword);
                    }
                  }}
                />
                <p className="text-xs text-[#A1A1AA]">The password is only used locally to decrypt your PDF. It is not stored or sent anywhere.</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep('upload'); setFile(null); setPdfPassword(''); }}
                className="text-sm text-[#A1A1AA] hover:text-white transition-colors"
              >
                Try Different File
              </button>
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className="px-4 py-2 rounded-full text-sm text-[#A1A1AA] hover:text-white">Cancel</button>
                <button
                  onClick={() => processFile(file, false, pdfPassword)}
                  disabled={!pdfPassword || uploading}
                  className="px-6 py-2 rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold text-sm hover:bg-[#FDE047]/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Decrypt & Process
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'consent' && (
          <div className="space-y-4 py-4">
            <div className="glass-card-sm border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">PDF Processing Requires AI</p>
                  <p className="text-sm text-[#A1A1AA]">{file?.name}</p>
                </div>
              </div>

              <p className="text-sm text-[#A1A1AA] mb-3">To extract transactions from your PDF, we need to send its contents to OpenAI's servers.</p>

              <div className="flex items-start gap-3 mt-4 pt-4 border-t border-white/[0.08]">
                <Checkbox
                  id="pdf-consent"
                  checked={pdfConsent}
                  onCheckedChange={setPdfConsent}
                  className="border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 mt-0.5"
                />
                <label htmlFor="pdf-consent" className="text-sm text-white cursor-pointer">
                  I consent to sharing my PDF data with OpenAI for transaction extraction
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { setStep('upload'); setFile(null); setPdfConsent(false); }} className="px-4 py-2 rounded-full text-sm text-[#A1A1AA] hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handlePdfConsent}
                disabled={!pdfConsent || uploading}
                className="px-6 py-2 rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold text-sm hover:bg-[#FDE047]/90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {uploading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col flex-1 overflow-hidden space-y-3 py-4">
            {/* Summary Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <ArrowUpRight size={14} className="text-red-400" />
                  <div>
                    <p className="text-[10px] text-red-300">Expenses</p>
                    <p className="font-bold text-sm text-red-400">{formatINR(totalExpenses)} <span className="text-[10px] font-normal">({expenseCount})</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <ArrowDownLeft size={14} className="text-green-400" />
                  <div>
                    <p className="text-[10px] text-green-300">Income</p>
                    <p className="font-bold text-sm text-green-400">{formatINR(totalIncome)} <span className="text-[10px] font-normal">({incomeCount})</span></p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="ai-categorize" checked={useAI} onCheckedChange={setUseAI} className="border-white/20 data-[state=checked]:bg-[#FDE047] data-[state=checked]:border-[#FDE047]" />
                <label htmlFor="ai-categorize" className="text-xs text-[#A1A1AA] cursor-pointer flex items-center gap-1">
                  <Sparkles size={12} className="text-[#FDE047]" /> AI
                </label>
                {useAI && (
                  <button onClick={handleAICategorize} disabled={aiLoading} className="text-xs px-3 py-1 rounded-full bg-[#FDE047]/20 text-[#FDE047] font-semibold">
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : 'Run'}
                  </button>
                )}
              </div>
            </div>

            {/* Warnings */}
            {likelyCreditCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-xs text-amber-300">
                  <strong>{likelyCreditCount}</strong> transactions look like income/credits. Review items with <span className="text-amber-400">amber border</span>.
                </p>
              </div>
            )}

            {autoAppliedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <Zap size={14} className="text-green-400" />
                <p className="text-xs text-green-300"><strong>{autoAppliedCount}</strong> auto-categorized from history</p>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-[#A1A1AA]" />

              {/* Type filter */}
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {['all', 'expense', 'income'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 text-xs font-medium transition-all ${
                      typeFilter === t ? 'bg-[#FDE047] text-[#0A0A0A]' : 'bg-white/[0.03] text-[#A1A1AA] hover:bg-white/[0.08]'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'expense' ? 'Expenses' : 'Income'}
                  </button>
                ))}
              </div>

              {/* Amount filter */}
              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="h-7 w-28 text-xs bg-white/[0.03] border-white/10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#171717] border-white/10 text-white">
                  {AMOUNT_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs focus:bg-white/10">{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-[#A1A1AA]">Showing {filteredTransactions.length} of {transactions.length}</span>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <button onClick={selectAllFiltered} className="flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-white px-2 py-1">
                {filteredIndices.every(i => selectedIndices.has(i)) && filteredIndices.length > 0 ? <CheckSquare size={14} className="text-[#FDE047]" /> : <Square size={14} />}
                {selectedIndices.size > 0 ? `${selectedIndices.size} selected` : 'Select'}
              </button>

              {selectedIndices.size > 0 && (
                <>
                  <div className="h-4 w-px bg-white/10" />
                  <Select value={bulkCategory} onValueChange={setBulkCategory}>
                    <SelectTrigger className="h-6 w-28 text-[10px] bg-white/[0.05] border-white/10 rounded">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#171717] border-white/10 text-white">
                      {categoryOptions.map(cat => (
                        <SelectItem key={cat} value={cat} className="text-xs focus:bg-white/10">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={applyBulkCategory} disabled={!bulkCategory} className="text-[10px] px-2 py-1 rounded bg-[#FDE047] text-[#0A0A0A] font-semibold disabled:opacity-50">Apply</button>
                  <button onClick={markSelectedAsIncome} className="text-[10px] px-2 py-1 rounded bg-green-500/20 text-green-400 font-semibold">Income</button>
                  <button onClick={removeSelected} className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 font-semibold">Remove</button>
                </>
              )}
            </div>

            {/* Transactions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 min-h-0">
              {filteredTransactions.map((txn, filteredIdx) => {
                const originalIdx = filteredIndices[filteredIdx];
                const isIncome = txn.type === 'income';
                const isLikelyCredit = txn.likely_credit && !isIncome;

                return (
                  <motion.div
                    key={originalIdx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(filteredIdx * 0.015, 0.3) }}
                    className={`glass-card-sm flex items-center gap-2 cursor-pointer transition-all ${
                      selectedIndices.has(originalIdx) ? 'ring-1 ring-[#FDE047]/50 bg-[#FDE047]/5' : ''
                    } ${isLikelyCredit ? 'border-amber-500/40 bg-amber-500/5' : ''} ${isIncome ? 'border-green-500/30 bg-green-500/5' : ''}`}
                    onClick={(e) => {
                      if (e.target.closest('button') || e.target.closest('[role="combobox"]')) return;
                      toggleSelect(originalIdx);
                    }}
                  >
                    <div className="flex-shrink-0">
                      {selectedIndices.has(originalIdx) ? <CheckSquare size={16} className="text-[#FDE047]" /> : <Square size={16} className="text-[#A1A1AA]" />}
                    </div>

                    {/* Type toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleTransactionType(originalIdx); }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                        isIncome ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                      title={isIncome ? 'Income (click to change)' : 'Expense (click to change)'}
                    >
                      {isIncome ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </button>

                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex flex-col items-center justify-center leading-none flex-shrink-0">
                      <span className="text-[10px] font-bold text-white">{txn.date?.slice(8)}</span>
                      <span className="text-[8px] text-[#A1A1AA] uppercase">
                        {new Date(txn.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[#A1A1AA] truncate" title={txn.description}>{txn.description || 'No description'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {!isIncome && (
                          <Select value={txn.category} onValueChange={(val) => updateTransaction(originalIdx, 'category', val)}>
                            <SelectTrigger className="h-5 w-28 text-[9px] bg-white/[0.05] border-white/10 rounded">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#171717] border-white/10 text-white">
                              {categoryOptions.map(cat => (
                                <SelectItem key={cat} value={cat} className="text-xs focus:bg-white/10">{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {isIncome && <span className="text-[9px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">Income</span>}
                        {txn.auto_categorized && <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-0.5"><Zap size={8} />Auto</span>}
                        {isLikelyCredit && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">Check?</span>}
                      </div>
                    </div>

                    <p className={`font-bold text-sm flex-shrink-0 ${isIncome ? 'text-green-400' : 'text-white'}`}>
                      {isIncome ? '+' : ''}{formatINR(txn.amount)}
                    </p>

                    <button
                      onClick={(e) => { e.stopPropagation(); removeTransaction(originalIdx); }}
                      className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 flex-shrink-0"
                    >
                      <Trash2 size={10} />
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
              <button onClick={() => { setStep('upload'); setFile(null); setTransactions([]); setSelectedIndices(new Set()); }} className="text-sm text-[#A1A1AA] hover:text-white">
                Different File
              </button>
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className="px-4 py-2 rounded-full text-sm text-[#A1A1AA] hover:text-white">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={importing || transactions.length === 0}
                  className="px-5 py-2 rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold text-sm hover:bg-[#FDE047]/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : `Import ${transactions.length}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
