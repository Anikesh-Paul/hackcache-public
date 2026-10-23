import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Outlet, RouterProvider, createBrowserRouter } from "react-router";
import { Shell, Placeholder, Landing } from "./Shell.tsx";
import { AppShell, WorldGate } from "./AppShell.tsx";
import { WorldProvider } from "./lib/world.tsx";
import { Proof } from "./Proof.tsx";
import { Invoices } from "./screens/Invoices.tsx";
import { InvoiceDetail } from "./screens/InvoiceDetail.tsx";
import { NewInvoice } from "./screens/NewInvoice.tsx";
import { Customers } from "./screens/Customers.tsx";
import { CustomerDetail } from "./screens/CustomerDetail.tsx";
import { DuplicatePreview, PrintInvoice } from "./screens/PrintInvoice.tsx";
import "./index.css";

// Every route from build plan §6.3 exists from day one, so deep links (and the
// static site's SPA rewrite) work before each screen is built.
const ownerScreens: [path: string, name: string][] = [
  ["/app", "Today"],
  ["/app/bank", "Bank"],
  ["/app/inbox", "Inbox"],
  ["/app/automation", "Automation"],
  ["/app/settings", "Settings"],
];

const otherScreens: [path: string, name: string][] = [
  ["/call/:invoiceId", "Call with AI"],
  ["/print/letter/:id", "Payment Demand Letter"],
  ["/print/case/:id", "ODR case file"],
];

/** The Owner's side: an anonymous session and their own Demo world. */
function Owner() {
  return (
    <WorldProvider>
      <Outlet />
    </WorldProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Owner />,
    children: [
      {
        element: <AppShell />,
        children: [
          ...ownerScreens.map(([path, name]) => ({ path, element: <Placeholder name={name} /> })),
          { path: "/app/invoices/new", element: <NewInvoice /> },
          { path: "/app/invoices", element: <Invoices /> },
          { path: "/app/invoices/:id/duplicate", element: <DuplicatePreview /> },
          { path: "/app/invoices/:id", element: <InvoiceDetail /> },
          { path: "/app/customers", element: <Customers /> },
          { path: "/app/customers/:id", element: <CustomerDetail /> },
        ],
      },
      {
        path: "/print/invoice/:id",
        element: (
          <WorldGate>
            <PrintInvoice />
          </WorldGate>
        ),
      },
      {
        element: <Shell />,
        children: [
          // The landing page opens the Demo world silently, so the books are ready on the first click.
          { path: "/", element: <Landing /> },
          ...otherScreens.map(([path, name]) => ({ path, element: <Placeholder name={name} /> })),
        ],
      },
    ],
  },
  {
    // The Customer side and /proof never touch the Owner's session.
    element: <Shell />,
    children: [
      { path: "/pay/:token", element: <Placeholder name="Pay link" /> },
      { path: "/proof", element: <Proof /> },
      { path: "*", element: <Placeholder name="Page not found" notFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
