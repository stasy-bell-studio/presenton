import { AlertTriangle, Plus, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation';
import React, { useState } from 'react'
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const CreateCustomTemplate = () => {
    const router = useRouter();
    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const handleOpenWarning = () => {
        trackEvent(MixpanelEvent.Templates_Build_Template_Clicked);
        setIsWarningOpen(true);
    };
    const handleAgree = () => {
        setIsWarningOpen(false);
        router.push('/custom-template');
    };

    return (
        <>
            <div
                onClick={handleOpenWarning}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenWarning();
                    }
                }}
                role="button"
                tabIndex={0}
                className='w-full rounded-[22px] border border-[#EDEEEF] cursor-pointer font-syne'>
                <div className='relative h-[215px] flex justify-center items-center '>
                    <img src="/card_bg.svg" alt="" className="absolute top-0 z-[1] left-0 w-full h-full object-cover" />
                    <div className='w-[36px] h-[36px] relative z-[4]  rounded-full bg-[#7A5AF8] flex items-center justify-center'
                        style={{
                            background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 100%), #FFF'
                        }}
                    ><div className='w-[26px] h-[26px] rounded-full bg-white flex items-center justify-center'>

                            <Plus className='w-4 h-4 text-[#A2A0A1]' />
                        </div>
                    </div>
                </div>
                <div className='px-5 py-4 bg-white flex items-center gap-4 overflow-hidden border-t  border-[#EDEEEF]'>
                    <div className='bg-[#7A5AF8] w-[45px] h-[45px] rounded-lg p-2 flex items-center justify-center'>

                        <Sparkles className='w-6 h-6 text-white' />
                    </div>
                    <div>
                        <h4 className='text-[#191919] text-sm font-semibold '>Build Template</h4>
                        <p className='flex text-[#808080] text-sm  font-medium items-center gap-2'>Build Your Own Template</p>
                    </div>

                </div>
            </div>
            <Dialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
                <DialogContent className="w-[calc(100vw-32px)] rounded-2xl border border-[#EDEEEF] bg-white p-0 font-syne shadow-2xl sm:max-w-[440px]">
                    <DialogHeader className="items-center px-6 pb-2 pt-7 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EBE9FE]">
                            <AlertTriangle className="h-6 w-6 text-[#7A5AF8]" aria-hidden="true" />
                        </div>
                        <DialogTitle className="text-lg font-semibold text-[#191919]">
                            Vision model required
                        </DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-[#667085]">
                            Custom template generation sends each slide as an image. It only works reliably with vision-capable text models. Please confirm your selected model supports image input before continuing.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-row gap-3 border-t border-[#F2F4F7] px-6 py-4 sm:justify-end sm:space-x-0">
                        <button
                            type="button"
                            onClick={() => setIsWarningOpen(false)}
                            className="h-10 rounded-lg border border-[#D0D5DD] bg-white px-4 text-sm font-medium text-[#344054] hover:bg-[#F9FAFB]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAgree}
                            className="h-10 rounded-lg bg-[#7A5AF8] px-4 text-sm font-semibold text-white hover:bg-[#6941C6]"
                        >
                            I agree
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default CreateCustomTemplate
