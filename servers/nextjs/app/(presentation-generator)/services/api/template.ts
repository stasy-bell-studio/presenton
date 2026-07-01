import { getApiUrl } from "@/utils/api";
import { ApiResponseHandler } from "./api-error-handler";
import { getHeader } from "./header";

export interface CloneTemplatePayload {
    id: string;
    name?: string;
    description?: string;
}

export interface CloneLayoutPayload {
    template_id: string;
    layout_id: string;
    layout_name?: string;
}

export interface TemplateV2ListResponse {
    items: TemplateV2ListItem[];
    total: number;
    page: number;
    page_size: number;
}

export interface TemplateV2ListItem {
    id: string;
    name: string;
    description?: string | null;
    layout_count?: number;
    thumbnail?: string | null;
    created_at?: string;
    updated_at?: string;
}

class TemplateService {

    static async getCustomTemplateSummaries() {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/all`),);
            return await ApiResponseHandler.handleResponse(response, "Failed to get custom template summaries");
        } catch (error) {
            console.error("Failed to get custom template summaries", error);
            throw error;
        }
    }

    static async getCustomTemplateDetails(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/${templateId}/layouts`),);
            return await ApiResponseHandler.handleResponse(response, "Failed to get custom template details");
        } catch (error) {
            console.error("Failed to get custom template details", error);
            throw error;
        }
    }

    static async getTemplateV2Summaries(): Promise<TemplateV2ListResponse> {
        try {
            const response = await fetch(getApiUrl(`/api/v2/templates?page_size=100`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get Templates V2 summaries");
        } catch (error) {
            console.error("Failed to get Templates V2 summaries", error);
            throw error;
        }
    }

    static async getTemplateV2Details(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v2/templates/${encodeURIComponent(templateId)}`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get Templates V2 details");
        } catch (error) {
            console.error("Failed to get Templates V2 details", error);
            throw error;
        }
    }

    static async deleteTemplateV2(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v2/templates/${encodeURIComponent(templateId)}`), {
                method: "DELETE",
                headers: getHeader(),
            });
            return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete Templates V2 template");
        } catch (error) {
            console.error("Failed to delete Templates V2 template", error);
            throw error;
        }
    }

    static async deleteCustomTemplate(presentationId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template-management/delete-templates/${presentationId}`), { method: "DELETE", headers: getHeader() });
            return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete custom template");
        } catch (error) {
            console.error("Failed to delete custom template", error);
            throw error;
        }
    }

    static async cloneCustomTemplate(payload: CloneTemplatePayload) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/clone`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify(payload),
            });
            return await ApiResponseHandler.handleResponse(response, "Failed to clone template");
        } catch (error) {
            console.error("Failed to clone template", error);
            throw error;
        }
    }

    static async cloneTemplateLayout(payload: CloneLayoutPayload) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/slide-layout/clone`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify(payload),
            });
            return await ApiResponseHandler.handleResponse(response, "Failed to clone layout");
        } catch (error) {
            console.error("Failed to clone layout", error);
            throw error;
        }
    }
}

export default TemplateService;
