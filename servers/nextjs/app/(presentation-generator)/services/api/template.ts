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

export interface Templatev1ListResponse {
    items: Templatev1ListItem[];
    total: number;
    page: number;
    page_size: number;
}

export interface Templatev1ListItem {
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

    static async getTemplatev1Summaries(): Promise<Templatev1ListResponse> {
        try {
            const response = await fetch(getApiUrl(`/api/v1/templates?page_size=100`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get Templates v1 summaries");
        } catch (error) {
            console.error("Failed to get Templates v1 summaries", error);
            throw error;
        }
    }

    static async getTemplatev1Details(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/templates/${encodeURIComponent(templateId)}`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get Templates v1 details");
        } catch (error) {
            console.error("Failed to get Templates v1 details", error);
            throw error;
        }
    }

    static async deleteTemplatev1(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/templates/${encodeURIComponent(templateId)}`), {
                method: "DELETE",
                headers: getHeader(),
            });
            return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete Templates v1 template");
        } catch (error) {
            console.error("Failed to delete Templates v1 template", error);
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
