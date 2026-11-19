'use client';

import { Component, type ReactNode } from 'react';

interface ArtBoundaryProps {
  children?: ReactNode;
}

interface ArtBoundaryState {
  failed: boolean;
}

/** Error boundary for decorative art. A render failure renders nothing. */
export class ArtBoundary extends Component<ArtBoundaryProps, ArtBoundaryState> {
  state: ArtBoundaryState = { failed: false };

  static getDerivedStateFromError(): ArtBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
