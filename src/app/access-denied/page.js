export default function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
      <h1 className="text-4xl font-bold text-red-500 mb-4">Access Denied</h1>
      <p className="text-lg text-gray-400 text-center mb-8">
        Unfortunately, access from your current location is restricted.
      </p>
      <p className="text-sm text-gray-500">
        Please contact support if you believe this is an error.
      </p>
    </div>
  );
} 