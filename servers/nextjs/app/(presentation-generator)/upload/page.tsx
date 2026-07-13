import React from "react";

import UploadPage from "./components/UploadPage";
import Header from "@/app/(presentation-generator)/(dashboard)/dashboard/components/Header";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Презентации 21 век",
  description:
    "Создание брендированных презентаций в фирменном стиле «21 век» — просто опишите задачу или прикрепите документы",
  keywords: [
    "презентации",
    "21 век",
    "страхование",
    "создание презентаций",
    "брендированные слайды",
  ],
  openGraph: {
    title: "Презентации 21 век",
    description:
      "Создание брендированных презентаций в фирменном стиле «21 век»",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Презентации 21 век",
    description:
      "Создание брендированных презентаций в фирменном стиле «21 век»",
  },
};

const page = () => {
  return (
    <div className="relative min-h-screen">
      <Header />
      <div className="mb-8 flex flex-col items-center justify-center min-[1800px]:mb-10 min-[2200px]:mb-12">
        <h1 className="relative font-manrope text-[48px] font-bold leading-[112%] text-[#1A1A1A] min-[1800px]:text-[56px] min-[2200px]:text-[64px]">
          СОЗДАНИЕ ПРЕЗЕНТАЦИИ
          <svg className="absolute -right-8 -top-2 h-8 w-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
            <path d="M20 0 L23 14 L37 17 L23 20 L20 34 L17 20 L3 17 L17 14 Z" fill="#EC6608" opacity="0.35"/>
          </svg>
        </h1>
        <p className="font-manrope text-lg text-[#1A1A1ACC] min-[1800px]:text-xl min-[2200px]:text-2xl mt-2">
          Опишите задачу или прикрепите документы — получите презентацию в фирменном стиле «21 век»
        </p>
      </div>

      <UploadPage />
    </div>
  );
};

export default page;
