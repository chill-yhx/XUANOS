import { useState } from 'react'
import { PrimaryButton } from './PrimaryButton'

interface ChatComposerProps {
  onStart: () => void
}

export function ChatComposer({ onStart }: ChatComposerProps) {
  const [value, setValue] = useState('')

  return (
    <div className="chat-composer">
      <div className="composer-input-wrap">
        <button className="icon-button" type="button" title="更多操作" aria-label="更多操作">+</button>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="输入你的目标、计划、困境，或让 XUANOS 开始提问。"
        />
      </div>
      <div className="composer-footer">
        <span>当前只需要给出一个可进入系统的问题。</span>
        <PrimaryButton onClick={onStart}>开始校准</PrimaryButton>
      </div>
    </div>
  )
}
