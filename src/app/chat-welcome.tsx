import { useState } from "react";
import styles from "./chat.module.css";

const topics = [
  {
    name: "Everyday nutrition",
    questions: [
      "How much protein does a vegetarian adult need every day?",
      "What are some everyday foods rich in fibre?",
      "Is mango a nutritious snack?",
    ],
  },
  {
    name: "In the kitchen",
    questions: [
      "Does cooking change the nutrients in vegetables?",
      "Why do we soak beans before cooking?",
      "How can I make vegetables taste good without overcooking them?",
    ],
  },
  {
    name: "Food safety",
    questions: [
      "How should I store leftover rice safely?",
      "Can I refreeze food after thawing it?",
      "How long can cooked food stay outside the fridge?",
    ],
  },
];

export function FoodPlate() {
  return (
    <svg
      className={styles.plate}
      viewBox="0 0 320 280"
      fill="none"
      aria-hidden="true"
      onPointerMove={(event) => {
        if (
          event.pointerType !== "mouse" ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          return;
        const plate = event.currentTarget;
        const bounds = plate.getBoundingClientRect();
        const x = Math.max(
          -1,
          Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1),
        );
        const y = Math.max(
          -1,
          Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1),
        );
        plate.style.setProperty("--plate-x", `${-y * 8}deg`);
        plate.style.setProperty("--plate-y", `${x * 8}deg`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.removeProperty("--plate-x");
        event.currentTarget.style.removeProperty("--plate-y");
      }}
    >
      <ellipse
        cx="166"
        cy="245"
        rx="105"
        ry="13"
        fill="#3b244d"
        opacity=".07"
      />
      <g className={styles.plateContents}>
        <circle cx="162" cy="137" r="113" fill="#e6ddf3" />
        <circle
          cx="157"
          cy="129"
          r="110"
          fill="white"
          stroke="#d8cbe9"
          strokeWidth="2"
        />
        <circle cx="157" cy="129" r="87" stroke="#eee8f5" strokeWidth="2" />
        <path
          d="M154 134C93 144 73 112 100 66C120 70 149 83 154 134Z"
          fill="#297865"
        />
        <path
          d="M156 134C130 86 149 55 183 60C199 101 183 126 156 134Z"
          fill="#72bb97"
        />
        <path
          d="M153 131L108 79M157 131L177 72"
          stroke="#c4e5c5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M168 143C161 104 198 72 218 92C240 116 216 157 188 173C177 179 169 163 168 143Z"
          fill="#f6b66e"
        />
        <path
          d="M184 121L207 133M181 145L193 151M195 101L214 112"
          stroke="#cf7942"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M99 137C119 119 151 143 155 164C166 206 128 218 106 194C88 175 83 155 99 137Z"
          fill="#357c5e"
        />
        <path
          d="M106 145C122 133 145 154 145 169C151 195 128 204 112 186C99 172 94 157 106 145Z"
          fill="#d1e7a0"
        />
        <ellipse
          cx="125"
          cy="172"
          rx="13"
          ry="16"
          transform="rotate(-26 125 172)"
          fill="#a26343"
        />
        <circle cx="182" cy="183" r="24" fill="#c66885" />
        <circle cx="182" cy="183" r="19" fill="#fff0e9" />
        <path
          d="M182 169L183 181L194 177M171 179L182 184L175 193M184 185L190 194"
          stroke="#e9a7b5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g fill="#e6c48f" stroke="#c29c69" strokeWidth="1.5">
          <circle cx="212" cy="160" r="6" />
          <circle cx="223" cy="172" r="6" />
          <circle cx="211" cy="185" r="6" />
          <circle cx="94" cy="116" r="6" />
          <circle cx="82" cy="128" r="6" />
          <circle cx="98" cy="132" r="6" />
        </g>
        <path
          d="M40 95L37 192M31 70L29 92Q38 108 47 94L49 73M39 71L37 97"
          stroke="#826994"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M281 125L277 196"
          stroke="#826994"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <ellipse
          cx="282"
          cy="102"
          rx="12"
          ry="25"
          transform="rotate(4 282 102)"
          fill="#b9a7cb"
        />
      </g>
      <path
        d="M239 39Q233 18 213 29Q216 46 239 39ZM239 39Q259 22 261 44Q249 53 239 39Z"
        fill="#72bb97"
      />
      <path d="M70 222Q48 211 43 229Q59 241 70 222Z" fill="#72bb97" />
    </svg>
  );
}

export function ChatWelcome({
  onChoose,
  disabled,
}: {
  onChoose: (question: string) => void;
  disabled: boolean;
}) {
  const [topic, setTopic] = useState(0);
  return (
    <div className={styles.empty}>
      <div className={styles.welcomeHero}>
        <div className={styles.welcomeCopy}>
          <h2>
            A little curiosity.
            <br />A better bite.
          </h2>
          <p>
            From the dal on your plate to the food in your fridge. Let’s talk
            about it.
          </p>
        </div>
        <FoodPlate />
      </div>
      <div className={styles.starters}>
        <div
          className={styles.topicBar}
          role="group"
          aria-label="Question topics"
        >
          {topics.map((item, index) => (
            <button
              key={item.name}
              type="button"
              aria-pressed={topic === index}
              onClick={() => setTopic(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div key={topic} className={styles.suggestions}>
          {topics[topic]?.questions.map((question) => (
            <button
              type="button"
              key={question}
              disabled={disabled}
              onClick={() => onChoose(question)}
            >
              <span>{question}</span>
              <span className={styles.addQuestion} aria-hidden="true">
                +
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
