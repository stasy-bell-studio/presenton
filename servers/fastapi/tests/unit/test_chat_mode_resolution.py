from api.v1.ppt.endpoints.chat import _resolve_chat_mode


def test_template_v2_context_uses_presentation_tools_even_if_outline_text_appears():
    message = (
        "UI context: the user is editing a rendered TemplateV2 presentation.\n"
        "UI context: the user is editing the outline draft before template/layout selection."
    )

    assert _resolve_chat_mode(message) == "presentation"


def test_outline_context_uses_outline_tools():
    assert (
        _resolve_chat_mode(
            "UI context: the user is editing the outline draft before template/layout selection."
        )
        == "outline"
    )
