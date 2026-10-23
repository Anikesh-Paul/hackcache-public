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
import { Today } from "./screens/Today.tsx";
import { Inbox } from "./screens/Inbox.tsx";
import { PayLink } from "./screens/PayLink.tsx";
import { CustomerDetail } from "./screens/CustomerDetail.tsx";
import { CallScreen } from "./screens/Call.tsx";
import { DuplicatePreview, PrintInvoice } from "./screens/PrintInvoice.tsx";
import "./index.css";

// Every route from build plan §6.3 exists from day one, so deep links (and the
// static site's SPA rewrite) work before each screen is built.
const ownerScreens: [path: string, name: string][] = [
  ["/app/bank", "Bank"],
  ["/app/automation", "Automation"],
  ["/app/settings", "Settings"],
];

const otherScreens: [path: string, name: string][] = [
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
          { path: "/app", element: <Today /> },
          ...ownerScreens.map(([path, name]) => ({ path, element: <Placeholder name={name} /> })),
          { path: "/app/invoices/new", element: <NewInvoice /> },
          { path: "/app/invoices", element: <Invoices /> },
          { path: "/app/invoices/:id/duplicate", element: <DuplicatePreview /> },
          { path: "/app/invoices/:id", element: <InvoiceDetail /> },
          { path: "/app/customers", element: <Customers /> },
          { path: "/app/customers/:id", element: <CustomerDetail /> },
          { path: "/app/inbox", element: <Inbox /> },
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
          // Not under the Owner's tabs: the call screen highlights none of them.
          { path: "/call/:invoiceId", element: <CallScreen /> },
          ...otherScreens.map(([path, name]) => ({ path, element: <Placeholder name={name} /> })),
        ],
      },
    ],
  },
  // The Customer side never touches the Owner's session, or Appwrite: only the server, with the pay token.
  { path: "/pay/:token", element: <PayLink /> },
  {
    // /proof never touches the Owner's session either.
    element: <Shell />,
    children: [
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
