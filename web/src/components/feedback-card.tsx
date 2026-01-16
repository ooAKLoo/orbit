'use client';

import { useState, useMemo } from 'react';
import { Mail, Clock, MessageSquare, Maximize2, X, Trash2, Copy, Check } from 'lucide-react';
import { Feedback, deleteFeedback } from '@/lib/api';

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
      const text = feedback.contact
        ? `${feedback.content}\n\n联系方式: ${feedback.contact}`
        : feedback.content;
      await navigator.clipboard.writeText(text);
      setCopiedId(feedback.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
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
      </div>
    </div>
  );

  return (
    <>
      <CompactView />
      {isFullscreen && <FullscreenView />}
    </>
  );
}
