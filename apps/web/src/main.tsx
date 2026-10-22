import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { Shell, Placeholder } from "./Shell.tsx";
import { Proof } from "./Proof.tsx";
import "./index.css";

// Every route from build plan §6.3 exists from day one, so deep links (and the
// static site's SPA rewrite) can be checked before the screens are built.
const screens: [path: string, name: string][] = [
  ["/", "Judge landing"],
  ["/app", "Today"],
  ["/app/invoices", "Invoices"],
  ["/app/invoices/new", "New invoice"],
  ["/app/invoices/:id", "Invoice"],
  ["/app/customers", "Customers"],
  ["/app/customers/:id", "Customer"],
  ["/app/bank", "Bank"],
  ["/app/inbox", "Inbox"],
  ["/app/automation", "Automation"],
  ["/app/settings", "Settings"],
  ["/pay/:token", "Pay link"],
  ["/call/:invoiceId", "Call with AI"],
  ["/print/invoice/:id", "Tax Invoice"],
  ["/print/letter/:id", "Payment Demand Letter"],
  ["/print/case/:id", "ODR case file"],
  ["/proof", "Proof"],
];

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      ...screens.map(([path, name]) => ({
        path,
        element: path === "/proof" ? <Proof /> : <Placeholder name={name} />,
      })),
      { path: "*", element: <Placeholder name="Page not found" notFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
