import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, AlertTriangle, Check, Sparkles, Loader2, Trash2, CheckSquare, Square, Zap, ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Clock, RotateCcw, Copy } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('expenses'); // 'expenses' | 'income'
  const [excludedIndices, setExcludedIndices] = useState(new Set()); // Tracks unchecked items
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
    setActiveTab('expenses');
    setExcludedIndices(new Set());
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

      // Auto-exclude income transactions, reversal pairs, and duplicates by default
      const autoExcludeIndices = new Set();
      txns.forEach((t, idx) => {
        if (t.type === 'income' || t.is_reversal || t.is_duplicate) {
          autoExcludeIndices.add(idx);
        }
      });
      setExcludedIndices(autoExcludeIndices);

      setStep('preview');
      setProcessingStep(null);

      const incomeCount = txns.filter(t => t.type === 'income').length;
      const expenseCount = txns.length - incomeCount;
      const autoMsg = autoAppliedCount > 0 ? ` (${autoAppliedCount} auto-categorized)` : '';
      toast.success(`Found ${expenseCount} expenses${incomeCount > 0 ? ` and ${incomeCount} income` : ''}${data.used_ai ? ' via AI' : ''}${autoMsg}`);
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
    // Only import transactions that are not excluded
    const toImport = transactions.filter((_, idx) => !excludedIndices.has(idx));
    if (toImport.length === 0) {
      toast.error('No transactions selected for import');
      return;
    }
    setImporting(true);

    try {
      const expenses = toImport.map(t => ({
        amount: t.amount,
        category: t.category,
        description: t.description,
        date: t.date,
        type: t.type || 'expense'
      }));
      const { data } = await api.createBulkExpenses(expenses);
      // Build toast message with all relevant info
      let toastMsg = `Imported ${data.created} transactions`;
      if (data.skipped_duplicates > 0) {
        toastMsg += ` • ${data.skipped_duplicates} duplicates skipped`;
      }
      if (data.learned_mappings > 0) {
        toastMsg += ` • learned ${data.learned_mappings} payee mappings`;
      }
      toast.success(toastMsg);
      handleClose();
      onSuccess?.();
    } catch (err) {
      toast.error('Failed to import');
    } finally {
      setImporting(false);
    }
  };

  // Separate expenses and income with their original indices
  const expenseTransactions = useMemo(() => {
    return transactions.map((t, idx) => ({ ...t, originalIdx: idx })).filter(t => t.type !== 'income');
  }, [transactions]);

  const incomeTransactions = useMemo(() => {
    return transactions.map((t, idx) => ({ ...t, originalIdx: idx })).filter(t => t.type === 'income');
  }, [transactions]);

  // Calculate totals for included (not excluded) transactions
  const includedExpenses = expenseTransactions.filter(t => !excludedIndices.has(t.originalIdx));
  const includedIncome = incomeTransactions.filter(t => !excludedIndices.has(t.originalIdx));

  const totalExpenses = includedExpenses.reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = includedIncome.reduce((sum, t) => sum + t.amount, 0);
  const expenseCount = expenseTransactions.length;
  const incomeCount = incomeTransactions.length;
  const includedExpenseCount = includedExpenses.length;
  const includedIncomeCount = includedIncome.length;
  const totalIncludedCount = includedExpenseCount + includedIncomeCount;
  const likelyCreditCount = expenseTransactions.filter(t => t.likely_credit).length;
  const reversalCount = transactions.filter(t => t.is_reversal).length;
  const duplicateCount = transactions.filter(t => t.is_duplicate).length;
  const categoryOptions = categories.map(c => c.name);

  // Toggle include/exclude for a transaction
  const toggleInclude = (originalIdx) => {
    setExcludedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(originalIdx)) {
        newSet.delete(originalIdx);
      } else {
        newSet.add(originalIdx);
      }
      return newSet;
    });
  };

  // Select/deselect all in a section
  const toggleAllExpenses = () => {
    const allExcluded = expenseTransactions.every(t => excludedIndices.has(t.originalIdx));
    setExcludedIndices(prev => {
      const newSet = new Set(prev);
      expenseTransactions.forEach(t => {
        if (allExcluded) {
          newSet.delete(t.originalIdx);
        } else {
          newSet.add(t.originalIdx);
        }
      });
      return newSet;
    });
  };

  const toggleAllIncome = () => {
    const allExcluded = incomeTransactions.every(t => excludedIndices.has(t.originalIdx));
    setExcludedIndices(prev => {
      const newSet = new Set(prev);
      incomeTransactions.forEach(t => {
        if (allExcluded) {
          newSet.delete(t.originalIdx);
        } else {
          newSet.add(t.originalIdx);
        }
      });
      return newSet;
    });
  };

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
            {/* Summary Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-[#FDE047]/10 to-green-500/10 border border-white/[0.1]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-[#FDE047]" />
                  Found {expenseCount + incomeCount} transactions
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox id="ai-categorize" checked={useAI} onCheckedChange={setUseAI} className="border-white/20 data-[state=checked]:bg-[#FDE047] data-[state=checked]:border-[#FDE047]" />
                  <label htmlFor="ai-categorize" className="text-xs text-[#A1A1AA] cursor-pointer flex items-center gap-1">
                    <Sparkles size={12} className="text-[#FDE047]" /> AI Categorize
                  </label>
                  {useAI && (
                    <button onClick={handleAICategorize} disabled={aiLoading} className="text-xs px-3 py-1 rounded-full bg-[#FDE047]/20 text-[#FDE047] font-semibold">
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : 'Run'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05]">
                  <ArrowUpRight size={14} className="text-red-400" />
                  <span className="text-xs text-[#A1A1AA]">Expenses:</span>
                  <span className="text-sm font-bold text-white">{expenseCount}</span>
                  <span className="text-xs text-[#A1A1AA]">({formatINR(expenseTransactions.reduce((s, t) => s + t.amount, 0))})</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05]">
                  <ArrowDownLeft size={14} className="text-green-400" />
                  <span className="text-xs text-[#A1A1AA]">Income:</span>
                  <span className="text-sm font-bold text-green-400">{incomeCount}</span>
                  <span className="text-xs text-[#A1A1AA]">(+{formatINR(incomeTransactions.reduce((s, t) => s + t.amount, 0))})</span>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {duplicateCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Copy size={14} className="text-orange-400" />
                <p className="text-xs text-orange-300">
                  <strong>{duplicateCount}</strong> duplicate{duplicateCount !== 1 ? 's' : ''} found (already in your records). Auto-excluded to prevent re-importing.
                </p>
              </div>
            )}
            {reversalCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <RotateCcw size={14} className="text-purple-400" />
                <p className="text-xs text-purple-300">
                  <strong>{reversalCount}</strong> likely reversal{reversalCount !== 1 ? 's' : ''} detected (same-day debit-credit pairs). Auto-excluded to avoid double counting.
                </p>
              </div>
            )}
            {likelyCreditCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-xs text-amber-300">
                  <strong>{likelyCreditCount}</strong> expense{likelyCreditCount !== 1 ? 's' : ''} look like income. Items marked with <span className="text-amber-400">amber</span> may need review.
                </p>
              </div>
            )}

            {autoAppliedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <Zap size={14} className="text-green-400" />
                <p className="text-xs text-green-300"><strong>{autoAppliedCount}</strong> auto-categorized from your history</p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.05]">
              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'expenses'
                    ? 'bg-[#FDE047] text-[#0A0A0A]'
                    : 'text-[#A1A1AA] hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <ArrowUpRight size={16} className={activeTab === 'expenses' ? 'text-red-600' : 'text-red-400'} />
                Expenses ({expenseCount})
              </button>
              <button
                onClick={() => setActiveTab('income')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'income'
                    ? 'bg-green-500 text-white'
                    : 'text-[#A1A1AA] hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <ArrowDownLeft size={16} className={activeTab === 'income' ? 'text-white' : 'text-green-400'} />
                Income ({incomeCount})
              </button>
            </div>

            {/* Transactions List - Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 min-h-0">
              {/* EXPENSES TAB */}
              {activeTab === 'expenses' && (
                <>
                  {expenseTransactions.length === 0 ? (
                    <div className="text-center py-8 text-[#A1A1AA]">
                      <ArrowUpRight size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No expense transactions found</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between sticky top-0 bg-[#171717] py-2 z-10">
                        <button
                          onClick={toggleAllExpenses}
                          className="flex items-center gap-2 text-xs text-[#A1A1AA] hover:text-white transition-colors"
                        >
                          {expenseTransactions.every(t => !excludedIndices.has(t.originalIdx)) ? (
                            <CheckSquare size={14} className="text-[#FDE047]" />
                          ) : expenseTransactions.some(t => !excludedIndices.has(t.originalIdx)) ? (
                            <CheckSquare size={14} className="text-[#FDE047]/50" />
                          ) : (
                            <Square size={14} className="text-[#A1A1AA]" />
                          )}
                          {expenseTransactions.every(t => !excludedIndices.has(t.originalIdx)) ? 'Deselect all' : 'Select all'}
                        </button>
                        <p className="text-sm font-bold text-white">
                          {includedExpenseCount} selected • {formatINR(totalExpenses)}
                        </p>
                      </div>

                      {expenseTransactions.map((txn) => {
                        const isIncluded = !excludedIndices.has(txn.originalIdx);
                        const isLikelyCredit = txn.likely_credit;
                        const isReversal = txn.is_reversal;
                        const isDuplicate = txn.is_duplicate;

                        return (
                          <motion.div
                            key={txn.originalIdx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`glass-card-sm flex items-center gap-2 cursor-pointer transition-all ${
                              isIncluded ? '' : 'opacity-40'
                            } ${isDuplicate ? 'border-orange-500/40 bg-orange-500/5' : isReversal ? 'border-purple-500/40 bg-purple-500/5' : isLikelyCredit ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
                            onClick={() => toggleInclude(txn.originalIdx)}
                          >
                            <div className="flex-shrink-0">
                              {isIncluded ? <CheckSquare size={16} className="text-[#FDE047]" /> : <Square size={16} className="text-[#A1A1AA]" />}
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); toggleTransactionType(txn.originalIdx); }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                              title="Expense (click to mark as income)"
                            >
                              <ArrowUpRight size={14} />
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
                                <Select value={txn.category} onValueChange={(val) => updateTransaction(txn.originalIdx, 'category', val)}>
                                  <SelectTrigger className="h-5 w-28 text-[9px] bg-white/[0.05] border-white/10 rounded" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#171717] border-white/10 text-white">
                                    {categoryOptions.map(cat => (
                                      <SelectItem key={cat} value={cat} className="text-xs focus:bg-white/10">{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {txn.auto_categorized && <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-0.5"><Zap size={8} />Auto</span>}
                                {isDuplicate && <span className="text-[8px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 flex items-center gap-0.5"><Copy size={8} />Duplicate</span>}
                                {isReversal && !isDuplicate && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-0.5"><RotateCcw size={8} />Reversal</span>}
                                {isLikelyCredit && !isReversal && !isDuplicate && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">Income?</span>}
                              </div>
                            </div>

                            <p className="font-bold text-sm flex-shrink-0 text-white">{formatINR(txn.amount)}</p>

                            <button
                              onClick={(e) => { e.stopPropagation(); removeTransaction(txn.originalIdx); }}
                              className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 flex-shrink-0"
                            >
                              <Trash2 size={10} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {/* INCOME TAB */}
              {activeTab === 'income' && (
                <>
                  {incomeTransactions.length === 0 ? (
                    <div className="text-center py-8 text-[#A1A1AA]">
                      <ArrowDownLeft size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No income transactions found</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between sticky top-0 bg-[#171717] py-2 z-10">
                        <button
                          onClick={toggleAllIncome}
                          className="flex items-center gap-2 text-xs text-[#A1A1AA] hover:text-white transition-colors"
                        >
                          {incomeTransactions.every(t => !excludedIndices.has(t.originalIdx)) ? (
                            <CheckSquare size={14} className="text-green-400" />
                          ) : incomeTransactions.some(t => !excludedIndices.has(t.originalIdx)) ? (
                            <CheckSquare size={14} className="text-green-400/50" />
                          ) : (
                            <Square size={14} className="text-[#A1A1AA]" />
                          )}
                          {incomeTransactions.every(t => !excludedIndices.has(t.originalIdx)) ? 'Deselect all' : 'Select all'}
                        </button>
                        <p className="text-sm font-bold text-green-400">
                          {includedIncomeCount} selected • +{formatINR(totalIncome)}
                        </p>
                      </div>

                      <div className="mb-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <p className="text-xs text-blue-300 flex items-center gap-2">
                          <AlertTriangle size={12} />
                          Income is excluded by default. Select items below to include them in import.
                        </p>
                      </div>

                      {incomeTransactions.map((txn) => {
                        const isIncluded = !excludedIndices.has(txn.originalIdx);
                        const isReversal = txn.is_reversal;
                        const isDuplicate = txn.is_duplicate;

                        return (
                          <motion.div
                            key={txn.originalIdx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`glass-card-sm flex items-center gap-2 cursor-pointer transition-all ${
                              isDuplicate ? 'border-orange-500/40 bg-orange-500/5' : isReversal ? 'border-purple-500/40 bg-purple-500/5' : 'border-green-500/30 bg-green-500/5'
                            } ${isIncluded ? '' : 'opacity-40'}`}
                            onClick={() => toggleInclude(txn.originalIdx)}
                          >
                            <div className="flex-shrink-0">
                              {isIncluded ? <CheckSquare size={16} className="text-green-400" /> : <Square size={16} className="text-[#A1A1AA]" />}
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); toggleTransactionType(txn.originalIdx); }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all"
                              title="Income (click to mark as expense)"
                            >
                              <ArrowDownLeft size={14} />
                            </button>

                            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex flex-col items-center justify-center leading-none flex-shrink-0">
                              <span className="text-[10px] font-bold text-white">{txn.date?.slice(8)}</span>
                              <span className="text-[8px] text-[#A1A1AA] uppercase">
                                {new Date(txn.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-[#A1A1AA] truncate" title={txn.description}>{txn.description || 'No description'}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[9px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">Income</span>
                                {isDuplicate && <span className="text-[8px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 flex items-center gap-0.5"><Copy size={8} />Duplicate</span>}
                                {isReversal && !isDuplicate && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-0.5"><RotateCcw size={8} />Reversal</span>}
                              </div>
                            </div>

                            <p className="font-bold text-sm flex-shrink-0 text-green-400">+{formatINR(txn.amount)}</p>

                            <button
                              onClick={(e) => { e.stopPropagation(); removeTransaction(txn.originalIdx); }}
                              className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 flex-shrink-0"
                            >
                              <Trash2 size={10} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
              <button onClick={() => { setStep('upload'); setFile(null); setTransactions([]); setExcludedIndices(new Set()); }} className="text-sm text-[#A1A1AA] hover:text-white">
                Different File
              </button>
              <div className="flex items-center gap-3">
                <button onClick={handleClose} className="px-4 py-2 rounded-full text-sm text-[#A1A1AA] hover:text-white">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={importing || totalIncludedCount === 0}
                  className="px-5 py-2.5 rounded-full bg-[#FDE047] text-[#0A0A0A] font-bold text-sm hover:bg-[#FDE047]/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#FDE047]/20"
                >
                  {importing ? (
                    <><Loader2 size={14} className="animate-spin" /> Importing...</>
                  ) : (
                    <>Import {includedExpenseCount} Expense{includedExpenseCount !== 1 ? 's' : ''}{includedIncomeCount > 0 ? ` + ${includedIncomeCount} Income` : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
