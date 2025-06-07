'use client';

import { useToastStore } from '../../stores/toastStore';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  
  if (toasts.length === 0) return null;
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };
  
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`p-4 rounded-lg shadow-lg border transition-all duration-300 transform animate-in slide-in-from-right ${
            toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            toast.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 ${
              toast.type === 'error' ? 'text-red-500' :
              toast.type === 'warning' ? 'text-yellow-500' :
              toast.type === 'success' ? 'text-green-500' :
              'text-blue-500'
            }`}>
              {getIcon(toast.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold">{toast.title}</h4>
              {toast.message && (
                <p className="text-sm mt-1 opacity-90 leading-relaxed">{toast.message}</p>
              )}
            </div>
            
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}