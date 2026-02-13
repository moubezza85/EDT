from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
LOGOS_DIR = ASSETS_DIR / "logos"

DEFAULT_FONT = "DejaVuSans"

def _register_fonts():
    """
    Enregistre la police normale et sa variante grasse pour permettre 
    l'usage des balises <b> sans erreur.
    """
    normal_ttf = FONTS_DIR / "DejaVuSans.ttf"
    bold_ttf = FONTS_DIR / "DejaVuSans-Bold.ttf"
    
    if normal_ttf.exists():
        pdfmetrics.registerFont(TTFont("DejaVuSans", str(normal_ttf)))
    
    if bold_ttf.exists():
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(bold_ttf)))
    else:
        # Fallback si le fichier Bold manque
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(normal_ttf)))

    registerFontFamily(
        DEFAULT_FONT,
        normal=DEFAULT_FONT,
        bold=f"{DEFAULT_FONT}-Bold",
    )

def _styles():
    ss = getSampleStyleSheet()
    base = ParagraphStyle(
        "Base",
        parent=ss["Normal"],
        fontName=DEFAULT_FONT,
        fontSize=8,
        leading=10,
    )
    title = ParagraphStyle(
        "Title",
        parent=base,
        fontSize=12,
        leading=14,
        alignment=1, # Center
    )
    mini = ParagraphStyle(
        "Mini",
        parent=base,
        fontSize=7,
        leading=8,
        alignment=1,
    )
    return {
        "base": base,
        "title": title,
        "mini": mini,
    }

def _safe(s: Any) -> str:
    return str(s) if s is not None else ""

def _build_header_block(model: Dict[str, Any], styles: Dict[str, ParagraphStyle], logo_filename: Optional[str]):
    header = model.get("header", {}) or {}
    ident = header.get("identity", {}) or {}
    
    # Bloc Gauche : Logo et Etablissement
    left_content = []
    if logo_filename:
        p = LOGOS_DIR / logo_filename
        if p.exists():
            left_content.append(Image(str(p), width=20*mm, height=20*mm))
    left_content.append(Paragraph("<b>OFPPT / DRCS</b>", styles["base"]))
    left_content.append(Paragraph("EFP : Complexe de Formation Meknès", styles["base"]))

    # Bloc Centre : Titre et Année
    center_content = [
        Paragraph("<b>EMPLOI DU TEMPS</b>", styles["title"]),
        Paragraph(f"Année de Formation {header.get('year', '2025-2026')}", styles["base"]),
    ]

    # Ligne d'infos (Formateur, Statut, Masse Horaire)
    info_data = [[
        Paragraph(f"<b>Formateur :</b> {ident.get('name','')}", styles["base"]),
        Paragraph(f"<b>Statut :</b> {ident.get('statut','Permanent')}", styles["base"]),
        Paragraph(f"<b>Nbre d'heures :</b> {header.get('total_hours', 0)} H", styles["base"])
    ]]
    info_table = Table(info_data, colWidths=[70*mm, 50*mm, 60*mm])
    info_table.setStyle(TableStyle([('LEFTPADDING', (0,0), (-1,-1), 0)]))

    main_table = Table([
        [left_content, center_content],
        [Paragraph(f"<i>Période d'application : <b>{header.get('period', 'A PARTIR DU 19/01/2026')}</b></i>", styles["base"]), ""],
        [info_table, ""]
    ], colWidths=[130*mm, 60*mm])
    
    main_table.setStyle(TableStyle([
        ('SPAN', (0,1), (1,1)),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (1,0), (1,0), 'CENTER'),
    ]))
    return main_table

def _build_grid_table(model: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> Table:
    days = model.get("days", ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"])
    slots = model.get("slots", [1, 2, 3, 4])
    slot_labels = model.get("slot_labels", {})
    grid = model.get("grid", {})

    # Header Row
    header_row = [Paragraph("<b>Jours / Heures</b>", styles["mini"])] + \
                 [Paragraph(f"<b>{slot_labels.get(s, '')}</b>", styles["mini"]) for s in slots]
    
    data = [header_row]
    for d in days:
        row = [Paragraph(f"<b>{d}</b>", styles["base"])]
        for s in slots:
            cell = grid.get(d, {}).get(s)
            if cell:
                # Format: Module <br/> Groupe <br/> Salle
                lines = cell.get("lines", [])
                content = "<br/>".join(f"<b>{_safe(l)}</b>" if i==0 else _safe(l) for i, l in enumerate(lines))
                row.append(Paragraph(content, styles["mini"]))
            else:
                row.append("")
        data.append(row)

    # Dimensions Fixes (Cible EDT_cible.png)
    col_widths = [25*mm] + [41*mm] * len(slots)
    row_heights = [10*mm] + [18*mm] * len(days)

    table = Table(data, colWidths=col_widths, rowHeights=row_heights)
    table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.7, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 0), (0, -1), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), f"{DEFAULT_FONT}-Bold"),
    ]))
    return table

def _build_footer_block(model: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> Table:
    header = model.get("header", {}) or {}
    view = header.get("view", "formateur")
    
    # Emargements
    label = [Paragraph("<b><u>Emargements :</u></b>", styles["base"]), Spacer(1, 10)]
    
    # Colonne Directeur (Présente partout)
    dir_col = [
        Paragraph("<u>Le Directeur d'établissement</u>", styles["base"]),
        Spacer(1, 4),
        Paragraph("Fait à : Meknès", styles["mini"]),
        Paragraph("Date : 20/12/2025", styles["mini"]),
    ]
    
    if view == "formateur":
        # Vue formateur : 2 colonnes (Directeur + Formateur)
        form_col = [Paragraph("<u>Signature du Formateur</u>", styles["base"])]
        sig_table = Table([[dir_col, form_col]], colWidths=[90*mm, 90*mm])
    else:
        # Vue Groupe/Salle : 1 seule colonne centrale pour le directeur
        sig_table = Table([[dir_col]], colWidths=[180*mm])
    
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER' if view != "formateur" else 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 30 if view == "formateur" else 0),
    ]))

    return Table([[label], [sig_table]], colWidths=[180*mm])

def render_timetable_pdf(
    model: Dict[str, Any],
    output_path: str,
    *,
    logo_filename: Optional[str] = "ofppt.png",
) -> None:
    _register_fonts()
    st = _styles()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=10*mm,
        rightMargin=10*mm,
        topMargin=10*mm,
        bottomMargin=10*mm,
    )

    elems = [
        _build_header_block(model, st, logo_filename),
        Spacer(1, 10),
        _build_grid_table(model, st),
        Spacer(1, 15),
        _build_footer_block(model, st)
    ]

    doc.build(elems)