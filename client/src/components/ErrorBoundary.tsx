import { Component, type ReactNode } from 'react';

/** กันจอขาวทั้งแอปถ้า component ใดพัง — รีเฟรชแล้วจะกลับเข้าห้องเดิมได้ (session อยู่ใน sessionStorage) */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[JinxO] UI error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-3xl font-medium">หน้าจอมีปัญหานิดหน่อย</h1>
        <p className="text-ink-soft">รีเฟรชแล้วคุณจะกลับเข้าห้องเดิม คะแนนและคำตอบยังอยู่ครบ</p>
        <button type="button" className="btn bg-jinx text-white" onClick={() => location.reload()}>
          รีเฟรชหน้า
        </button>
      </div>
    );
  }
}
