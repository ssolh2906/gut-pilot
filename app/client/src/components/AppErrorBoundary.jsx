import { Component } from "react";


export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in the developer console without exposing a stack
    // trace in the scientist-facing demo.
    console.error("Gut Pilot interface error", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-bg">
        <section className="block max-w-xl w-full">
          <div className="block-head">
            <div>
              <h1>Refresh the demo interface</h1>
              <p className="sub">The analysis service is still available, but this browser view needs a clean reload.</p>
            </div>
          </div>
          <div className="block-body pad-t flex flex-col gap-4">
            <p className="text-sm text-ink-2">
              Reload the page, then drop the Baxter archive again—or choose the bundled Baxter demo—to resume with a clean analysis session.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Refresh Gut Pilot
            </button>
          </div>
        </section>
      </main>
    );
  }
}
