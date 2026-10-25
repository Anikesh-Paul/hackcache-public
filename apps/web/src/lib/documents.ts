import type { CustomerRow, InvoiceRow, WorkspaceRow } from "@tagada/appwrite";
import type { DocumentCustomer, DocumentInvoice, DocumentPromise, DocumentSeller, PromiseFacts } from "@tagada/domain";

export function sellerOf(workspace: WorkspaceRow): DocumentSeller {
  return {
    businessName: workspace.businessName,
    address: workspace.address,
    gstin: workspace.gstin,
    upiVpa: workspace.upiVpa,
    ownerEmail: workspace.ownerEmail,
    udyamType: workspace.udyamType,
    udyamNumber: workspace.udyamNumber ?? null,
    isTrader: workspace.isTrader,
  };
}

export function customerOf(customer: CustomerRow): DocumentCustomer {
  return { name: customer.name, address: customer.address, place: customer.place, gstin: customer.gstin };
}

export function invoiceOf(invoice: InvoiceRow): DocumentInvoice {
  return {
    $id: invoice.$id,
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalPaise: invoice.totalPaise,
    paidPaise: invoice.paidPaise,
    status: invoice.status,
    ladderStage: invoice.ladderStage,
    pausedUntil: invoice.pausedUntil,
    pauseReason: invoice.pauseReason,
  };
}

/** Every Promise and Plan in the world, each with its Invoice, so a document demands only what is past due. */
export function promisesForDocument(byInvoice: ReadonlyMap<string, readonly PromiseFacts[]>): DocumentPromise[] {
  return [...byInvoice].flatMap(([invoiceId, list]) => list.map((promise) => ({ invoiceId, ...promise })));
}

/** The Invoice this page was opened from, plus the Customer's other unpaid Invoices. The document keeps only what is past due. */
export function invoicesForDocument(invoices: readonly InvoiceRow[], current: InvoiceRow): InvoiceRow[] {
  if (current.status === "paid" || current.status === "cancelled" || current.status === "draft") return [current];
  const others = invoices.filter(
    (invoice) =>
      invoice.customerId === current.customerId &&
      invoice.$id !== current.$id &&
      invoice.status !== "paid" &&
      invoice.status !== "cancelled" &&
      invoice.status !== "draft",
  );
  return [current, ...others];
}
