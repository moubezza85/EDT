from __future__ import annotations

import io
import zipfile
from tempfile import NamedTemporaryFile
from pathlib import Path

from flask import Blueprint, send_file, abort

from services.rbac import require_roles, current_user

from services.timetable_service import (
    build_print_model,
    list_all_trainers,
    list_all_groupes,
    list_all_salles,
)
from reports.timetable_pdf import render_timetable_pdf

reports_bp = Blueprint("reports", __name__)

BASE_DIR = Path(__file__).resolve().parent.parent
print(BASE_DIR)
TMP_DIR = BASE_DIR / "tmp"
TMP_DIR.mkdir(exist_ok=True)


# -------------------------------------------------------------------
# PDF individuel – Formateur
# -------------------------------------------------------------------

@reports_bp.route("/api/reports/timetable/formateur/<trainer_key>", methods=["GET"])
@require_roles("admin", "formateur")
def pdf_formateur(trainer_key: str):
    """
    Génère le PDF emploi du temps pour un formateur donné (id ou nom).
    """
    u = current_user()
    role = str(u.get("role", "")).lower()
    # formateur: uniquement son propre id (pas d'exports globaux)
    if role == "formateur" and str(trainer_key).strip() != str(u.get("id")).strip():
        abort(403)

    model = build_print_model("formateur", trainer_key)

    ident = model["header"]["identity"]
    name = ident.get("name", trainer_key)
    matricule = ident.get("matricule", trainer_key)

    filename = f"EDT_Formateur_{name.replace(' ', '_')}_{matricule}.pdf"

    tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)
    render_timetable_pdf(
        model,
        tmp.name,
        logo_filename="ofppt.png",
    )

    return send_file(
        tmp.name,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )

# -------------------------------------------------------------------
# PDF individuel – Groupe
# -------------------------------------------------------------------

@reports_bp.route("/api/reports/timetable/groupe/<groupe>", methods=["GET"])
@require_roles("admin")
def pdf_groupe(groupe: str):
    model = build_print_model("groupe", groupe)

    filename = f"EDT_Groupe_{groupe}.pdf"
    tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)

    render_timetable_pdf(
        model,
        tmp.name,
        logo_filename="ofppt.png",
    )

    return send_file(
        tmp.name,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# -------------------------------------------------------------------
# PDF individuel – Salle
# -------------------------------------------------------------------

@reports_bp.route("/api/reports/timetable/salle/<salle>", methods=["GET"])
@require_roles("admin")
def pdf_salle(salle: str):
    model = build_print_model("salle", salle)

    filename = f"EDT_Salle_{salle}.pdf"
    tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)

    render_timetable_pdf(
        model,
        tmp.name,
        logo_filename="ofppt.png",
    )

    return send_file(
        tmp.name,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# -------------------------------------------------------------------
# ZIP global – semaine courante
# Formateurs + Groupes + Salles
# -------------------------------------------------------------------

@reports_bp.route("/api/reports/timetable/all", methods=["GET"])
@require_roles("admin")
def zip_week():
    """
    Génère un ZIP contenant :
      - tous les PDF Formateurs
      - tous les PDF Groupes
      - tous les PDF Salles
    pour la semaine courante.
    """
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # -------------------------
        # Formateurs
        # -------------------------
        for trainer in list_all_trainers():
            model = build_print_model("formateur", trainer.id)

            filename = f"formateurs/EDT_Formateur_{trainer.name.replace(' ', '_')}_{trainer.id}.pdf"
            tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)

            render_timetable_pdf(
                model,
                tmp.name,
                logo_filename="ofppt.png",
            )

            zf.write(tmp.name, filename)

        # -------------------------
        # Groupes
        # -------------------------
        for groupe in list_all_groupes():
            model = build_print_model("groupe", groupe)

            filename = f"groupes/EDT_Groupe_{groupe}.pdf"
            tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)

            render_timetable_pdf(
                model,
                tmp.name,
                logo_filename="ofppt.png",
            )

            zf.write(tmp.name, filename)

        # -------------------------
        # Salles
        # -------------------------
        for salle in list_all_salles():
            model = build_print_model("salle", salle)

            filename = f"salles/EDT_Salle_{salle}.pdf"
            tmp = NamedTemporaryFile(delete=False, suffix=".pdf", dir=TMP_DIR)

            render_timetable_pdf(
                model,
                tmp.name,
                logo_filename="ofppt.png",
            )

            zf.write(tmp.name, filename)

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="EDT_Semaine_Courante.zip",
    )
