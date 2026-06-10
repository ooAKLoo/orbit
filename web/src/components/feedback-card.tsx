'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Clock, MessageSquare, Maximize2, X, Trash2, Copy, Check, Paperclip, Download, Loader2 } from 'lucide-react';
import { Feedback, FeedbackAttachment, deleteFeedback, downloadFeedbackAttachment } from '@/lib/api';

interface FeedbackCardProps {
  feedbacks: Feedback[];
  appId: string;
  onFeedbackDeleted: (feedbackId: number) => void;
}

interface GroupedFeedbacks {
  [key: string]: Feedback[];
}

export function FeedbackCard({ feedbacks, appId, onFeedbackDeleted }: FeedbackCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);

  // Group feedbacks by date (YYYY-MM-DD)
  const groupedFeedbacks = useMemo(() => {
    const groups: GroupedFeedbacks = {};

    for (const feedback of feedbacks) {
      const date = new Date(feedback.created_at * 1000);
      const key = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(feedback);
    }

    return groups;
  }, [feedbacks]);

  // Get sorted date keys (newest first)
  const sortedDates = useMemo(() => {
    return Object.keys(groupedFeedbacks).sort((a, b) => b.localeCompare(a));
  }, [groupedFeedbacks]);

  // Format date for display
  const formatDateHeader = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return '今天';
    }
    if (dateStr === yesterday.toISOString().split('T')[0]) {
      return '昨天';
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (year === today.getFullYear()) {
      return `${month}月${day}日`;
    }
    return `${year}年${month}月${day}日`;
  };

  // Copy feedback content
  const handleCopy = async (feedback: Feedback, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const attachmentText = feedback.attachments?.length
        ? `\n\n附件: ${feedback.attachments.map((attachment) => attachment.file_name).join(', ')}`
        : '';
      const text = feedback.contact
        ? `${feedback.content}\n\n联系方式: ${feedback.contact}${attachmentText}`
        : `${feedback.content}${attachmentText}`;
      await navigator.clipboard.writeText(text);
      setCopiedId(feedback.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))}KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const handleDownloadAttachment = async (
    feedback: Feedback,
    attachment: FeedbackAttachment,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (downloadingAttachmentId) return;

    try {
      setDownloadingAttachmentId(attachment.id);
      const { blob, filename } = await downloadFeedbackAttachment(appId, feedback.id, attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || attachment.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download attachment:', err);
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  // Delete feedback
  const handleDelete = async (feedback: Feedback, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;

    try {
      setDeletingId(feedback.id);
      await deleteFeedback(appId, feedback.id);
      onFeedbackDeleted(feedback.id);
    } catch (err) {
      console.error('Failed to delete feedback:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Feedback item component
  const FeedbackItem = ({ feedback, showFullContent = false }: { feedback: Feedback; showFullContent?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className={`p-3 bg-[#f8f8f8] rounded-xl cursor-pointer transition-colors hover:bg-neutral-100 relative group ${
          deletingId === feedback.id ? 'opacity-50' : ''
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => handleCopy(feedback)}
      >
        <p className={`text-sm text-neutral-700 pr-16 ${showFullContent ? '' : 'line-clamp-2'}`}>
          {feedback.content}
        </p>
        <div className="flex items-center gap-3 mt-2">
          {feedback.contact && (
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <Mail className="w-3 h-3" />
              <span className={showFullContent ? '' : 'truncate max-w-20'}>{feedback.contact}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <Clock className="w-3 h-3" />
            <span>
              {new Date(feedback.created_at * 1000).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {feedback.attachments && feedback.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {feedback.attachments.map((attachment) => (
              <button
                key={attachment.id}
                onClick={(e) => handleDownloadAttachment(feedback, attachment, e)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800 disabled:opacity-50"
                disabled={downloadingAttachmentId === attachment.id}
                title="下载附件"
              >
                <Paperclip className="h-3 w-3 flex-shrink-0" />
                <span className="max-w-40 truncate">{attachment.file_name}</span>
                <span className="flex-shrink-0 text-neutral-300">{formatFileSize(attachment.file_size)}</span>
                {downloadingAttachmentId === attachment.id ? (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div
          className={`absolute right-3 top-3 flex items-center gap-1 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            onClick={(e) => handleCopy(feedback, e)}
            className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="复制"
          >
            {copiedId === feedback.id ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={(e) => handleDelete(feedback, e)}
            disabled={deletingId === feedback.id}
            className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // Compact card view
  const CompactView = () => (
    <div className="bg-white rounded-2xl p-5 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-sm font-medium text-neutral-900">用户反馈</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">{feedbacks.length} 条</span>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="全屏查看"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto hide-scrollbar min-h-0">
        {feedbacks.length > 0 ? (
          feedbacks.slice(0, 10).map((feedback) => (
            <FeedbackItem key={feedback.id} feedback={feedback} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-neutral-300">
            <MessageSquare className="w-8 h-8 mb-2" />
            <p className="text-sm">暂无反馈</p>
          </div>
        )}
      </div>
    </div>
  );

  // Fullscreen modal view
  const FullscreenView = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">用户反馈</h2>
            <p className="text-sm text-neutral-400 mt-1">共 {feedbacks.length} 条反馈</p>
          </div>
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {feedbacks.length > 0 ? (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => (
                <div key={dateKey}>
                  <div className="sticky top-0 bg-white py-2 z-10">
                    <h3 className="text-sm font-medium text-neutral-500">
                      {formatDateHeader(dateKey)}
                    </h3>
                  </div>
                  <div className="space-y-3 mt-2">
                    {groupedFeedbacks[dateKey].map((feedback) => (
                      <FeedbackItem key={feedback.id} feedback={feedback} showFullContent />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
              <MessageSquare className="w-12 h-12 mb-3" />
              <p className="text-base">暂无反馈</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <>
      <CompactView />
      <AnimatePresence>
        {isFullscreen && <FullscreenView />}
      </AnimatePresence>
    </>
  );
}
