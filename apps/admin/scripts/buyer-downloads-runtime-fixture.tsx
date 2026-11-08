import { createRoot } from "react-dom/client";
import { runBuyerDownloadsMountedTests } from "./buyer-downloads-mounted-tests";
function Fixture() {
  return (
    <main>
      <h1>Private paid file source acceptance</h1>
      <button
        onClick={() => {
          void (async () => {
            const status = document.getElementById("status")!;
            try {
              const proof = await runBuyerDownloadsMountedTests(
                document.getElementById("checks")!,
              );
              await fetch("/fixture/proof", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(proof),
              });
              status.textContent = JSON.stringify(proof);
            } catch (e) {
              status.textContent = String(e);
            }
          })();
        }}
      >
        Run bounded checks
      </button>
      <pre id="status" />
      <div id="checks" />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
