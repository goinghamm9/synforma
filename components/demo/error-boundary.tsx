"use client";
import * as React from "react";

interface Props {
  fallback: React.ReactNode | ((error: Error) => React.ReactNode);
  /** Change this value to reset the boundary (e.g. a new graph id). */
  resetKey?: string | number;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Minimal error boundary so an optional visual (the 3D graph, a chart) never takes the page down. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error) return typeof this.props.fallback === "function" ? this.props.fallback(error) : this.props.fallback;
    return this.props.children;
  }
}
