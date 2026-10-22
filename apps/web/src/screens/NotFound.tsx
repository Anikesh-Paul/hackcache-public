import { Link } from "react-router";
import { Ln, Paper } from "../ui.tsx";

export function NotFound({ what }: { what: string }) {
  return (
    <Paper label={`${what} not found`}>
      <Ln>
        <h1 className="text-xl">No such {what} in your books</h1>
        <p className="mt-2 text-ink-2">
          It may belong to another Demo world, or the demo was reset. <Link to="/app/invoices">See every Invoice</Link>.
        </p>
      </Ln>
    </Paper>
  );
}
