/** an accent-coloured ring for content that is still being prepared */
export default function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return <span className="loading-spinner" role="status" aria-label={label} />;
}
