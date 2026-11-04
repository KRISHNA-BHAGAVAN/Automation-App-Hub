import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      const err = new Error(obj.message);
      if (typeof obj.stack === 'string') err.stack = obj.stack;
      return err;
    }
    try {
      return new Error(JSON.stringify(value));
    } catch {
      return new Error(String(value));
    }
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  return new Error(String(value ?? 'An unexpected error occurred.'));
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const errorMessage =
    error?.message || (typeof error === 'string' ? error : 'An unexpected error occurred.');

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          This part of the app hit an unexpected error.
        </p>
        <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800">
          {errorMessage}
        </pre>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={resetError}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Try again
          </button>
          <a
            href="/"
            onClick={() => {
              resetError();
              window.location.href = '/';
            }}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to workspace
          </a>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const err = toError(error);
    const msg = (err.message || '').toLowerCase();
    if (
      msg.includes('websocket') ||
      msg.includes('ws://') ||
      msg.includes('wss://') ||
      msg.includes('@vite/client') ||
      msg.includes('vite')
    ) {
      return { error: null };
    }
    return { error: err };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = toError(error);
    const msg = (err.message || '').toLowerCase();
    if (
      msg.includes('websocket') ||
      msg.includes('ws://') ||
      msg.includes('wss://') ||
      msg.includes('@vite/client') ||
      msg.includes('vite')
    ) {
      return;
    }
    console.warn(
      'ErrorBoundary caught an error:',
      err.message,
      info?.componentStack || '',
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
