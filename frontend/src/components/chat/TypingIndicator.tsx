'use client';

export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1 px-4 py-2">
      <div className="flex space-x-1">
        <span 
          className="w-2 h-2 bg-[#00FFA3] rounded-full animate-bounce" 
          style={{ animationDelay: '0ms', animationDuration: '600ms' }}
        />
        <span 
          className="w-2 h-2 bg-[#00FFA3] rounded-full animate-bounce" 
          style={{ animationDelay: '150ms', animationDuration: '600ms' }}
        />
        <span 
          className="w-2 h-2 bg-[#00FFA3] rounded-full animate-bounce" 
          style={{ animationDelay: '300ms', animationDuration: '600ms' }}
        />
      </div>
    </div>
  );
}
