import './globals.css';

export const metadata = {
  title: 'WorkflowLite - Fuel Station Reporting',
  description: 'Multi-site shift reporting for fuel station operators',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
