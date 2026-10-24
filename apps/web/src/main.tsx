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
import { Bank } from "./screens/Bank.tsx";
import { Automation } from "./screens/Automation.tsx";
import { Settings } from "./screens/Settings.tsx";
import { DuplicatePreview, PrintInvoice } from "./screens/PrintInvoice.tsx";
import { PrintLetter } from "./screens/PrintLetter.tsx";
import { PrintCase } from "./screens/PrintCase.tsx";
import "./index.css";

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
          { path: "/app/automation", element: <Automation /> },
          { path: "/app/settings", element: <Settings /> },
          { path: "/app/invoices/new", element: <NewInvoice /> },
          { path: "/app/invoices", element: <Invoices /> },
          { path: "/app/invoices/:id/duplicate", element: <DuplicatePreview /> },
          { path: "/app/invoices/:id", element: <InvoiceDetail /> },
          { path: "/app/customers", element: <Customers /> },
          { path: "/app/customers/:id", element: <CustomerDetail /> },
          { path: "/app/inbox", element: <Inbox /> },
          { path: "/app/bank", element: <Bank /> },
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
        path: "/print/letter/:id",
        element: (
          <WorldGate>
            <PrintLetter />
          </WorldGate>
        ),
      },
      {
        path: "/print/case/:id",
        element: (
          <WorldGate>
            <PrintCase />
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
