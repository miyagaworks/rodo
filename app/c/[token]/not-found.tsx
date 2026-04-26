export default function PublicConfirmationNotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: '#f9fafb' }}
    >
      <div className="max-w-lg w-full text-center">
        <p
          className="text-sm font-bold tracking-widest mb-4"
          style={{ color: 'var(--color-main)' }}
        >
          404 NOT FOUND
        </p>
        <h1
          className="text-xl font-bold mb-3"
          style={{ color: 'var(--color-main)' }}
        >
          お探しのページが見つかりません
        </h1>
        <p className="text-sm" style={{ color: '#666' }}>
          URLが正しいかご確認ください
        </p>
      </div>
    </div>
  )
}
