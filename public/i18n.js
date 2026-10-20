/**
 * KoRForge - Sistema de Internacionalización (i18n)
 * Idiomas soportados: en (Default), es, gl, fr, it
 * 100% local, 0 tokens, 0 llamadas a API
 */
(function (global) {
  'use strict';

  const TRANSLATIONS = {
    en: {
      // Navigation
      nav_search: 'Search Addons',
      nav_favorites: 'Favorite Addons',
      nav_installed: 'Installed Addons',
      nav_backups: 'WTF Vault',
      nav_settings: 'Settings',
      nav_update_to: 'Update to',
      nav_update_latest: 'Version',
      nav_update_check: 'Check again',

      // Address Bar / Topbar
      topbar_search: 'KoRForge / Search Addons',
      topbar_favorites: 'KoRForge / Favorite Addons',
      topbar_installed: 'KoRForge / Installed Addons',
      topbar_backups: 'KoRForge / WTF Vault',
      topbar_settings: 'KoRForge / Settings',
      topbar_explorer: 'KoRForge / Addon Explorer',
      topbar_details: 'KoRForge / Addon Details',
      topbar_web: 'KoRForge / Browser',

      // Catalog / Search
      search_placeholder: 'Search addon by name, author or category...',
      search_btn: 'Search',
      clear_filters_btn: 'Clear Filters',
      category_all: 'All Categories',
      sort_popular: 'Most Popular',
      sort_downloads: 'Total Downloads',
      sort_updated: 'Recently Updated',
      sort_name: 'Name (A-Z)',
      results_found: 'Found addons',
      no_results: 'No addons found matching your search.',

      // Cards & Version Pills
      ver_available: 'Version:',
      ver_installed: 'Your ver:',
      ver_installed_check: '✓ Your ver:',
      status_installed: 'Installed',
      btn_install: '⚡ Install',
      btn_installed: '✓ Installed',
      btn_installing: 'Installing...',
      btn_update: '⚡ Update',
      btn_view_details: 'Details',
      card_downloads: 'downloads',
      card_updated: 'Updated:',

      // Installed Addons Pane
      installed_title: 'Installed Addons',
      installed_subtitle: 'Manage, update and toggle your active World of Warcraft addons.',
      installed_filter_placeholder: 'Filter by name or folder...',
      installed_tab_all: 'All',
      installed_tab_updates: 'Updates',
      installed_tab_enabled: 'Active',
      installed_tab_disabled: 'Disabled',
      installed_btn_check_updates: '⚡ Check for Updates',
      installed_btn_update_all: '⚡ Update All',
      installed_btn_open_folder: '📁 Open AddOns Folder',
      installed_toggle_enable: 'Enable addon',
      installed_toggle_disable: 'Disable addon',
      installed_folder_tag: 'Folder:',
      installed_deps_tag: 'Dependencies:',
      installed_uninstall_title: 'Uninstall addon',
      installed_empty: 'No addons installed found in this World of Warcraft client.',

      // Favorites Pane
      favorites_title: 'Favorite Addons',
      favorites_subtitle: 'Personal collection of saved addons for fast 1-click installation.',
      favorites_empty: 'You have no favorite addons saved yet. Click the star ⭐ on any catalog addon to add it.',
      favorites_filter_placeholder: 'Filter favorites...',

      // WTF Vault Pane
      vault_title: 'Configuration Vault (WTF)',
      vault_subtitle: 'Clean snapshots of your macros, action bars and interface profiles. If the game crashes, restore in 1 click.',
      vault_btn_create: '💾 Create New Backup Now',
      vault_empty: 'No WTF backups yet. Click "Create New Backup Now" to safeguard your settings.',
      vault_restore_btn: 'Restaurar',
      vault_delete_btn: 'Eliminar',

      // Settings Pane
      settings_title: 'KoRForge Settings',
      settings_subtitle: 'System preferences, window behavior and World of Warcraft directories.',
      settings_app_card: '🖥️ Application Behavior',
      settings_app_desc: 'Control startup with Windows, system tray behavior and display language.',
      settings_autostart_title: 'Launch on Windows startup',
      settings_autostart_desc: 'Start KoRForge automatically in background when turning on the PC.',
      settings_minimized_title: 'Start minimized in background',
      settings_minimized_desc: 'Do not bring the window to the front on launch until you open it.',
      settings_closetotray_title: 'Minimize to tray on Close',
      settings_closetotray_desc: 'When clicking Close, keep the app active in the system tray next to the clock.',
      settings_lang_title: 'Application Language',
      settings_lang_desc: 'Choose the interface language for KoRForge.',
      settings_wow_card: '🎮 World of Warcraft Versions & Directories',
      settings_wow_desc: 'Manage your game clients (Forever, Retail, Classic). Use root auto-detection or configure independent paths.',
      settings_autodetect_title: '🔍 Root Directory Auto-Detection',
      settings_autodetect_tip: 'Recommended if clients share the same parent folder',
      settings_autodetect_desc: 'Enter the main World of Warcraft directory (e.g. C:\\World of Warcraft). KoRForge will automatically detect _forever_, _retail_, _classic_era_ and _classic_.',
      settings_autodetect_btn: '🔍 Auto-detect Clients',
      settings_manual_card: '📦 Manual Addon Installation (URL / ZIP / GitHub)',
      settings_manual_desc: 'Paste a direct download URL, GitHub repository or zip link to install directly.',
      settings_manual_btn: '⚡ Download & Install',

      // Detail View
      detail_back_btn: '← Back to Addon Explorer',
      detail_by: 'by',
      detail_downloads: 'Downloads:',
      detail_cat_ver: 'Catalog version:',
      detail_my_ver: 'Your installed version:',
      detail_updated: 'Updated:',
      detail_created: 'Created:',
      detail_repo: '📦 Repository / Code ↗',
      detail_wiki: '📖 Official Wiki ↗',
      detail_issues: '🐛 Report Bug ↗',
      detail_tab_desc: 'Description',
      detail_tab_files: 'Files & Versions',
      detail_btn_translate_es: '🇪🇸 Translate to Spanish',
      detail_btn_translate_orig: '🇬🇧 View Original (EN)',

      // Toasts & Alerts
      toast_backup_created: 'WTF backup created successfully',
      toast_backup_restored: 'WTF backup restored successfully',
      toast_addon_installed: 'Addon installed successfully',
      toast_addon_uninstalled: 'Addon uninstalled',
      toast_checking_updates: 'Checking for updates on CurseForge...',
      toast_no_updates: 'All your addons are up to date'
    },

    es: {
      // Navigation
      nav_search: 'Buscar Addons',
      nav_favorites: 'Addons Favoritos',
      nav_installed: 'Addons Instalados',
      nav_backups: 'Bóveda WTF',
      nav_settings: 'Configuración',
      nav_update_to: 'Actualizar a',
      nav_update_latest: 'Versión',
      nav_update_check: 'Comprobar de nuevo',

      // Address Bar / Topbar
      topbar_search: 'KoRForge / Buscar Addons',
      topbar_favorites: 'KoRForge / Addons Favoritos',
      topbar_installed: 'KoRForge / Addons Instalados',
      topbar_backups: 'KoRForge / Bóveda WTF',
      topbar_settings: 'KoRForge / Configuración',
      topbar_explorer: 'KoRForge / Explorador de Addons',
      topbar_details: 'KoRForge / Detalle de Addon',
      topbar_web: 'KoRForge / Navegador',

      // Catalog / Search
      search_placeholder: 'Buscar addon por nombre, autor o categoría...',
      search_btn: 'Buscar',
      clear_filters_btn: 'Limpiar Filtros',
      category_all: 'Todas las Categorías',
      sort_popular: 'Más Populares',
      sort_downloads: 'Más Descargados',
      sort_updated: 'Última Actualización',
      sort_name: 'Nombre (A-Z)',
      results_found: 'Addons encontrados',
      no_results: 'No se encontraron addons con ese criterio de búsqueda.',

      // Cards & Version Pills
      ver_available: 'Versión:',
      ver_installed: 'Tu ver:',
      ver_installed_check: '✓ Tu ver:',
      status_installed: 'Instalado',
      btn_install: '⚡ Instalar',
      btn_installed: '✓ Instalado',
      btn_installing: 'Instalando...',
      btn_update: '⚡ Actualizar',
      btn_view_details: 'Ver Detalles',
      card_downloads: 'descargas',
      card_updated: 'Actualizado:',

      // Installed Addons Pane
      installed_title: 'Addons Instalados',
      installed_subtitle: 'Gestiona, actualiza y activa o desactiva tus addons instalados en World of Warcraft.',
      installed_filter_placeholder: 'Filtrar por nombre o carpeta...',
      installed_tab_all: 'Todos',
      installed_tab_updates: 'Con Actualización',
      installed_tab_enabled: 'Activos',
      installed_tab_disabled: 'Desactivados',
      installed_btn_check_updates: '⚡ Buscar Actualizaciones',
      installed_btn_update_all: '⚡ Actualizar Todos',
      installed_btn_open_folder: '📁 Abrir Carpeta AddOns',
      installed_toggle_enable: 'Activar addon',
      installed_toggle_disable: 'Desactivar addon',
      installed_folder_tag: 'Carpeta:',
      installed_deps_tag: 'Librerías / Dependencias:',
      installed_uninstall_title: 'Desinstalar addon',
      installed_empty: 'No se encontraron addons instalados en este cliente de World of Warcraft.',

      // Favorites Pane
      favorites_title: 'Addons Favoritos',
      favorites_subtitle: 'Colección personal de addons guardados para instalación rápida en 1 clic.',
      favorites_empty: 'Aún no tienes addons favoritos. Pulsa la estrella ⭐ en cualquier addon del catálogo para añadirlo.',
      favorites_filter_placeholder: 'Filtrar favoritos...',

      // WTF Vault Pane
      vault_title: 'Bóveda de Configuración (WTF)',
      vault_subtitle: 'Snapshots limpios de tus macros, barras y perfiles de interfaz. Si la beta crashea, restauras en 1 clic.',
      vault_btn_create: '💾 Crear Nuevo Backup Ahora',
      vault_empty: 'Aún no hay copias de seguridad de WTF. Haz clic en "Crear Nuevo Backup Ahora" para asegurar tus perfiles.',
      vault_restore_btn: 'Restaurar',
      vault_delete_btn: 'Eliminar',

      // Settings Pane
      settings_title: 'Configuración de KoRForge',
      settings_subtitle: 'Ajustes del sistema, comportamiento de ventana y directorio de WoW Forever.',
      settings_app_card: '🖥️ Comportamiento de la Aplicación',
      settings_app_desc: 'Controla el arranque con el sistema, la bandeja de tareas y el idioma de la app.',
      settings_autostart_title: 'Arrancar con Windows',
      settings_autostart_desc: 'Iniciar KoRForge automáticamente en segundo plano al encender el PC.',
      settings_minimized_title: 'Arrancar minimizado en segundo plano',
      settings_minimized_desc: 'No abrir la ventana en primer plano al iniciar KoRForge hasta que tú la abras.',
      settings_closetotray_title: 'Minimizar a la bandeja al pulsar Cerrar',
      settings_closetotray_desc: 'Al hacer clic en Cerrar, la app permanece activa en la barra de tareas junto al reloj.',
      settings_lang_title: 'Idioma de la Aplicación',
      settings_lang_desc: 'Selecciona el idioma de la interfaz de KoRForge.',
      settings_wow_card: '🎮 Gestor de Versiones y Rutas de World of Warcraft',
      settings_wow_desc: 'Gestiona tus clientes (Forever, Retail, Classic). Puedes usar la auto-detección o configurar la ruta independiente.',
      settings_autodetect_title: '🔍 Auto-Detección por Directorio Raíz',
      settings_autodetect_tip: 'Recomendado si tus clientes comparten carpeta',
      settings_autodetect_desc: 'Introduce la carpeta general de World of Warcraft (ej: C:\\World of Warcraft). KoRForge detectará automáticamente _forever_, _retail_, _classic_era_ y _classic_.',
      settings_autodetect_btn: '🔍 Auto-detectar Clientes',
      settings_manual_card: '📦 Instalación Manual de Addons (URL / ZIP / GitHub)',
      settings_manual_desc: 'Pega la URL de descarga directa, repositorio de GitHub o enlace zip de un addon.',
      settings_manual_btn: '⚡ Descargar e Instalar',

      // Detail View
      detail_back_btn: '← Volver al Explorador de Addons',
      detail_by: 'por',
      detail_downloads: 'Descargas:',
      detail_cat_ver: 'Versión catálogo:',
      detail_my_ver: 'Tu versión instalada:',
      detail_updated: 'Actualizado:',
      detail_created: 'Creado:',
      detail_repo: '📦 Repositorio / Código ↗',
      detail_wiki: '📖 Wiki oficial ↗',
      detail_issues: '🐛 Reportar Bug ↗',
      detail_tab_desc: 'Descripción',
      detail_tab_files: 'Archivos y Versiones',
      detail_btn_translate_es: '🇪🇸 Traducir a Español',
      detail_btn_translate_orig: '🇬🇧 Ver Original (EN)',

      // Toasts & Alerts
      toast_backup_created: 'Copia de seguridad WTF creada con éxito',
      toast_backup_restored: 'Copia de seguridad WTF restaurada correctamente',
      toast_addon_installed: 'Addon instalado correctamente',
      toast_addon_uninstalled: 'Addon desinstalado',
      toast_checking_updates: 'Buscando actualizaciones en CurseForge...',
      toast_no_updates: 'Todos tus addons están actualizados'
    },

    gl: {
      // Navigation
      nav_search: 'Buscar Addons',
      nav_favorites: 'Addons Favoritos',
      nav_installed: 'Addons Instalados',
      nav_backups: 'Bóveda WTF',
      nav_settings: 'Axustes',
      nav_update_to: 'Actualizar a',
      nav_update_latest: 'Versión',
      nav_update_check: 'Comprobar de novo',

      // Address Bar / Topbar
      topbar_search: 'KoRForge / Buscar Addons',
      topbar_favorites: 'KoRForge / Addons Favoritos',
      topbar_installed: 'KoRForge / Addons Instalados',
      topbar_backups: 'KoRForge / Bóveda WTF',
      topbar_settings: 'KoRForge / Axustes',
      topbar_explorer: 'KoRForge / Explorador de Addons',
      topbar_details: 'KoRForge / Detalle do Addon',
      topbar_web: 'KoRForge / Navegador',

      // Catalog / Search
      search_placeholder: 'Buscar addon por nome, autor ou categoría...',
      search_btn: 'Buscar',
      clear_filters_btn: 'Limpar Filtros',
      category_all: 'Todas as Categorías',
      sort_popular: 'Máis Populares',
      sort_downloads: 'Máis Descargados',
      sort_updated: 'Última Actualización',
      sort_name: 'Nome (A-Z)',
      results_found: 'Addons atopados',
      no_results: 'Non se atoparon addons con ese criterio de busca.',

      // Cards & Version Pills
      ver_available: 'Versión:',
      ver_installed: 'A túa ver:',
      ver_installed_check: '✓ A túa ver:',
      status_installed: 'Instalado',
      btn_install: '⚡ Instalar',
      btn_installed: '✓ Instalado',
      btn_installing: 'Instalando...',
      btn_update: '⚡ Actualizar',
      btn_view_details: 'Ver Detalles',
      card_downloads: 'descargas',
      card_updated: 'Actualizado:',

      // Installed Addons Pane
      installed_title: 'Addons Instalados',
      installed_subtitle: 'Xestiona, actualiza e activa ou desactiva os teus addons instalados en World of Warcraft.',
      installed_filter_placeholder: 'Filtrar por nome ou cartafol...',
      installed_tab_all: 'Todos',
      installed_tab_updates: 'Con Actualización',
      installed_tab_enabled: 'Activos',
      installed_tab_disabled: 'Desactivados',
      installed_btn_check_updates: '⚡ Buscar Actualizacións',
      installed_btn_update_all: '⚡ Actualizar Todos',
      installed_btn_open_folder: '📁 Abrir Cartafol AddOns',
      installed_toggle_enable: 'Activar addon',
      installed_toggle_disable: 'Desactivar addon',
      installed_folder_tag: 'Cartafol:',
      installed_deps_tag: 'Dependencias:',
      installed_uninstall_title: 'Desinstalar addon',
      installed_empty: 'Non se atoparon addons instalados neste cliente de World of Warcraft.',

      // Favorites Pane
      favorites_title: 'Addons Favoritos',
      favorites_subtitle: 'Colección persoal de addons gardados para instalación rápida nun só clic.',
      favorites_empty: 'Aínda non tes addons favoritos. Preme na estrela ⭐ en calquera addon do catálogo para engadilo.',
      favorites_filter_placeholder: 'Filtrar favoritos...',

      // WTF Vault Pane
      vault_title: 'Bóveda de Configuración (WTF)',
      vault_subtitle: 'Copias limpas das túas macros, barras e perfís de interface. Restaura nun clic se falla o xogo.',
      vault_btn_create: '💾 Crear Novo Backup Agora',
      vault_empty: 'Aínda non hai copias de seguridade de WTF. Fai clic en "Crear Novo Backup Agora" para protexer os teus perfís.',
      vault_restore_btn: 'Restaurar',
      vault_delete_btn: 'Eliminar',

      // Settings Pane
      settings_title: 'Axustes de KoRForge',
      settings_subtitle: 'Preferencias do sistema, ventá e cartafoles de World of Warcraft.',
      settings_app_card: '🖥️ Comportamento da Aplicación',
      settings_app_desc: 'Controla o arranque co sistema, a bandexa de tarefas e o idioma da interface.',
      settings_autostart_title: 'Arrincar con Windows',
      settings_autostart_desc: 'Iniciar KoRForge automaticamente en segundo plano ao acender o ordenador.',
      settings_minimized_title: 'Arrincar minimizado en segundo plano',
      settings_minimized_desc: 'Non traer a ventá ao primeiro plano ao iniciar ata que a abras.',
      settings_closetotray_title: 'Minimizar á bandexa ao pechar',
      settings_closetotray_desc: 'Ao premer Pechar, a aplicación segue activa na bandexa xunto ao reloxo.',
      settings_lang_title: 'Idioma da Aplicación',
      settings_lang_desc: 'Selecciona o idioma da interface de KoRForge.',
      settings_wow_card: '🎮 Xestor de Versións e Rutas de World of Warcraft',
      settings_wow_desc: 'Xestiona os teus clientes (Forever, Retail, Classic). Usa a auto-detección ou configura rutas independentes.',
      settings_autodetect_title: '🔍 Auto-Detección polo Directorio Raíz',
      settings_autodetect_tip: 'Recomendado se os teus clientes comparten cartafol',
      settings_autodetect_desc: 'Introduce o cartafol xeral de World of Warcraft (ex: C:\\World of Warcraft). KoRForge detectará automaticamente _forever_, _retail_, _classic_era_ e _classic_.',
      settings_autodetect_btn: '🔍 Auto-detectar Clientes',
      settings_manual_card: '📦 Instalación Manual de Addons (URL / ZIP / GitHub)',
      settings_manual_desc: 'Pega o URL de descarga directa, repositorio de GitHub ou ligazón zip dun addon.',
      settings_manual_btn: '⚡ Descargar e Instalar',

      // Detail View
      detail_back_btn: '← Volver ao Explorador de Addons',
      detail_by: 'por',
      detail_downloads: 'Descargas:',
      detail_cat_ver: 'Versión catálogo:',
      detail_my_ver: 'A túa versión instalada:',
      detail_updated: 'Actualizado:',
      detail_created: 'Creado:',
      detail_repo: '📦 Repositorio / Código ↗',
      detail_wiki: '📖 Wiki oficial ↗',
      detail_issues: '🐛 Informar de Erro ↗',
      detail_tab_desc: 'Descrición',
      detail_tab_files: 'Ficheiros e Versións',
      detail_btn_translate_es: '🇪🇸 Traducir a Español',
      detail_btn_translate_orig: '🇬🇧 Ver Orixinal (EN)',

      // Toasts & Alerts
      toast_backup_created: 'Copia de seguridade WTF creada con éxito',
      toast_backup_restored: 'Copia de seguridade WTF restaurada correctamente',
      toast_addon_installed: 'Addon instalado correctamente',
      toast_addon_uninstalled: 'Addon desinstalado',
      toast_checking_updates: 'Buscando actualizacións en CurseForge...',
      toast_no_updates: 'Todos os teus addons están actualizados'
    },

    fr: {
      // Navigation
      nav_search: 'Rechercher des Addons',
      nav_favorites: 'Addons Favoris',
      nav_installed: 'Addons Installés',
      nav_backups: 'Coffre-fort WTF',
      nav_settings: 'Paramètres',
      nav_update_to: 'Mettre à jour vers',
      nav_update_latest: 'Version',
      nav_update_check: 'Vérifier à nouveau',

      // Address Bar / Topbar
      topbar_search: 'KoRForge / Rechercher des Addons',
      topbar_favorites: 'KoRForge / Addons Favoris',
      topbar_installed: 'KoRForge / Addons Installés',
      topbar_backups: 'KoRForge / Coffre-fort WTF',
      topbar_settings: 'KoRForge / Paramètres',
      topbar_explorer: 'KoRForge / Explorateur d’Addons',
      topbar_details: 'KoRForge / Détails de l’Addon',
      topbar_web: 'KoRForge / Navigateur',

      // Catalog / Search
      search_placeholder: 'Rechercher par nom d’addon, auteur ou catégorie...',
      search_btn: 'Rechercher',
      clear_filters_btn: 'Effacer les Filtres',
      category_all: 'Toutes les catégories',
      sort_popular: 'Les plus populaires',
      sort_downloads: 'Total des téléchargements',
      sort_updated: 'Dernière mise à jour',
      sort_name: 'Nom (A-Z)',
      results_found: 'Addons trouvés',
      no_results: 'Aucun addon trouvé pour cette recherche.',

      // Cards & Version Pills
      ver_available: 'Version :',
      ver_installed: 'Votre ver :',
      ver_installed_check: '✓ Votre ver :',
      status_installed: 'Installé',
      btn_install: '⚡ Installer',
      btn_installed: '✓ Installé',
      btn_installing: 'Installation...',
      btn_update: '⚡ Mettre à jour',
      btn_view_details: 'Voir Détails',
      card_downloads: 'téléchargements',
      card_updated: 'Mis à jour :',

      // Installed Addons Pane
      installed_title: 'Addons Installés',
      installed_subtitle: 'Gérez, mettez à jour et activez/désactivez vos addons World of Warcraft.',
      installed_filter_placeholder: 'Filtrer par nom ou dossier...',
      installed_tab_all: 'Tous',
      installed_tab_updates: 'Mises à jour',
      installed_tab_enabled: 'Actifs',
      installed_tab_disabled: 'Désactivés',
      installed_btn_check_updates: '⚡ Vérifier les mises à jour',
      installed_btn_update_all: '⚡ Tout mettre à jour',
      installed_btn_open_folder: '📁 Ouvrir dossier AddOns',
      installed_toggle_enable: 'Activer addon',
      installed_toggle_disable: 'Désactiver addon',
      installed_folder_tag: 'Dossier :',
      installed_deps_tag: 'Dépendances :',
      installed_uninstall_title: 'Désinstaller addon',
      installed_empty: 'Aucun addon installé trouvé dans ce client World of Warcraft.',

      // Favorites Pane
      favorites_title: 'Addons Favoris',
      favorites_subtitle: 'Votre collection personnelle d’addons enregistrés pour une installation rapide en 1 clic.',
      favorites_empty: 'Vous n’avez pas encore d’addons favoris. Cliquez sur l’étoile ⭐ pour en ajouter.',
      favorites_filter_placeholder: 'Filtrer les favoris...',

      // WTF Vault Pane
      vault_title: 'Coffre-fort de Configuration (WTF)',
      vault_subtitle: 'Sauvegardes de vos macros, barres et profils d’interface. Restaurez en 1 clic en cas de plantage.',
      vault_btn_create: '💾 Créer une Sauvegarde',
      vault_empty: 'Aucune sauvegarde WTF pour le moment. Cliquez sur "Créer une Sauvegarde" pour protéger vos profils.',
      vault_restore_btn: 'Restaurer',
      vault_delete_btn: 'Supprimer',

      // Settings Pane
      settings_title: 'Paramètres de KoRForge',
      settings_subtitle: 'Préférences système, comportement des fenêtres et dossiers de World of Warcraft.',
      settings_app_card: '🖥️ Comportement de l’Application',
      settings_app_desc: 'Contrôlez le démarrage automatique avec Windows, la barre d’état et la langue.',
      settings_autostart_title: 'Lancer au démarrage de Windows',
      settings_autostart_desc: 'Démarrer KoRForge en arrière-plan à l’allumage du PC.',
      settings_minimized_title: 'Démarrer réduit en arrière-plan',
      settings_minimized_desc: 'Ne pas ouvrir la fenêtre au premier plan jusqu’à ce que vous la lanciez.',
      settings_closetotray_title: 'Réduire dans la barre d’état à la fermeture',
      settings_closetotray_desc: 'En cliquant sur Fermer, l’application reste active près de l’horloge.',
      settings_lang_title: 'Langue de l’Application',
      settings_lang_desc: 'Choisissez la langue d’affichage de KoRForge.',
      settings_wow_card: '🎮 Versions et Répertoires de World of Warcraft',
      settings_wow_desc: 'Gérez vos clients (Forever, Retail, Classic). Détection automatique ou chemins personnalisés.',
      settings_autodetect_title: '🔍 Détection Automatique par Répertoire Racine',
      settings_autodetect_tip: 'Recommandé si vos clients partagent le même dossier parent',
      settings_autodetect_desc: 'Indiquez le répertoire général de WoW (ex: C:\\World of Warcraft). KoRForge détectera _forever_, _retail_, _classic_era_ et _classic_.',
      settings_autodetect_btn: '🔍 Détecter les Clients',
      settings_manual_card: '📦 Installation Manuelle d’Addon (URL / ZIP / GitHub)',
      settings_manual_desc: 'Collez une URL de téléchargement direct, un dépôt GitHub ou un lien zip.',
      settings_manual_btn: '⚡ Télécharger et Installer',

      // Detail View
      detail_back_btn: '← Retour à l’Explorateur',
      detail_by: 'par',
      detail_downloads: 'Téléchargements :',
      detail_cat_ver: 'Version catalogue :',
      detail_my_ver: 'Votre version installée :',
      detail_updated: 'Mis à jour :',
      detail_created: 'Créé le :',
      detail_repo: '📦 Dépôt / Code source ↗',
      detail_wiki: '📖 Wiki officiel ↗',
      detail_issues: '🐛 Signaler un bug ↗',
      detail_tab_desc: 'Description',
      detail_tab_files: 'Fichiers et Versions',
      detail_btn_translate_es: '🇪🇸 Traduire en espagnol',
      detail_btn_translate_orig: '🇬🇧 Voir l’original (EN)',

      // Toasts & Alerts
      toast_backup_created: 'Sauvegarde WTF créée avec succès',
      toast_backup_restored: 'Sauvegarde WTF restaurée avec succès',
      toast_addon_installed: 'Addon installé avec succès',
      toast_addon_uninstalled: 'Addon désinstallé',
      toast_checking_updates: 'Recherche de mises à jour sur CurseForge...',
      toast_no_updates: 'Tous vos addons sont à jour'
    },

    it: {
      // Navigation
      nav_search: 'Cerca Addon',
      nav_favorites: 'Addon Preferiti',
      nav_installed: 'Addon Installati',
      nav_backups: 'Cassaforte WTF',
      nav_settings: 'Impostazioni',
      nav_update_to: 'Aggiorna a',
      nav_update_latest: 'Versione',
      nav_update_check: 'Controlla di nuovo',

      // Address Bar / Topbar
      topbar_search: 'KoRForge / Cerca Addon',
      topbar_favorites: 'KoRForge / Addon Preferiti',
      topbar_installed: 'KoRForge / Addon Installati',
      topbar_backups: 'KoRForge / Cassaforte WTF',
      topbar_settings: 'KoRForge / Impostazioni',
      topbar_explorer: 'KoRForge / Esplora Addon',
      topbar_details: 'KoRForge / Dettagli Addon',
      topbar_web: 'KoRForge / Browser',

      // Catalog / Search
      search_placeholder: 'Cerca addon per nome, autore o categoria...',
      search_btn: 'Cerca',
      clear_filters_btn: 'Cancella Filtri',
      category_all: 'Tutte le Categorie',
      sort_popular: 'Più Popolari',
      sort_downloads: 'Più Scaricati',
      sort_updated: 'Aggiornato di Recente',
      sort_name: 'Nome (A-Z)',
      results_found: 'Addon trovati',
      no_results: 'Nessun addon trovato corrispondente ai criteri.',

      // Cards & Version Pills
      ver_available: 'Versione:',
      ver_installed: 'Tua ver:',
      ver_installed_check: '✓ Tua ver:',
      status_installed: 'Installato',
      btn_install: '⚡ Installa',
      btn_installed: '✓ Installato',
      btn_installing: 'Installazione...',
      btn_update: '⚡ Aggiorna',
      btn_view_details: 'Vedi Dettagli',
      card_downloads: 'download',
      card_updated: 'Aggiornato:',

      // Installed Addons Pane
      installed_title: 'Addon Installati',
      installed_subtitle: 'Gestisci, aggiorna e attiva o disattiva i tuoi addon per World of Warcraft.',
      installed_filter_placeholder: 'Filtra per nome o cartella...',
      installed_tab_all: 'Tutti',
      installed_tab_updates: 'Aggiornamenti',
      installed_tab_enabled: 'Attivi',
      installed_tab_disabled: 'Disattivati',
      installed_btn_check_updates: '⚡ Controlla Aggiornamenti',
      installed_btn_update_all: '⚡ Aggiorna Tutti',
      installed_btn_open_folder: '📁 Apri Cartella AddOns',
      installed_toggle_enable: 'Attiva addon',
      installed_toggle_disable: 'Disattiva addon',
      installed_folder_tag: 'Cartella:',
      installed_deps_tag: 'Dipendenze:',
      installed_uninstall_title: 'Disinstalla addon',
      installed_empty: 'Nessun addon installato trovato in questo client di World of Warcraft.',

      // Favorites Pane
      favorites_title: 'Addon Preferiti',
      favorites_subtitle: 'Collezione personale di addon salvati per un’installazione rapida in 1 clic.',
      favorites_empty: 'Non hai ancora addon preferiti. Clicca sulla stella ⭐ per aggiungerne.',
      favorites_filter_placeholder: 'Filtra preferiti...',

      // WTF Vault Pane
      vault_title: 'Cassaforte di Configurazione (WTF)',
      vault_subtitle: 'Backup puliti di macro, barre e profili di interfaccia. Ripristina in 1 clic in caso di crash.',
      vault_btn_create: '💾 Crea Nuovo Backup',
      vault_empty: 'Nessun backup WTF presente. Clicca su "Crea Nuovo Backup" per proteggere i tuoi profili.',
      vault_restore_btn: 'Ripristina',
      vault_delete_btn: 'Elimina',

      // Settings Pane
      settings_title: 'Impostazioni di KoRForge',
      settings_subtitle: 'Preferenze di sistema, comportamento finestra e cartelle di World of Warcraft.',
      settings_app_card: '🖥️ Comportamento dell’Applicazione',
      settings_app_desc: 'Controlla l’avvio con Windows, la barra delle applicazioni e la lingua.',
      settings_autostart_title: 'Avvia con Windows',
      settings_autostart_desc: 'Avvia KoRForge automaticamente in background all’accensione del PC.',
      settings_minimized_title: 'Avvia ridotto a icona in background',
      settings_minimized_desc: 'Non portare la finestra in primo piano all’avvio finché non la apri.',
      settings_closetotray_title: 'Riduci nella barra delle applicazioni alla chiusura',
      settings_closetotray_desc: 'Quando clicchi Chiudi, l’app rimane attiva accanto all’orologio.',
      settings_lang_title: 'Lingua dell’Applicazione',
      settings_lang_desc: 'Scegli la lingua dell’interfaccia di KoRForge.',
      settings_wow_card: '🎮 Versioni e Percorsi di World of Warcraft',
      settings_wow_desc: 'Gestisci i client (Forever, Retail, Classic). Rilevamento automatico o percorsi personalizzati.',
      settings_autodetect_title: '🔍 Rilevamento Automatico dalla Cartella Radice',
      settings_autodetect_tip: 'Consigliato se i client condividono la stessa cartella padre',
      settings_autodetect_desc: 'Inserisci la cartella generale di World of Warcraft (es: C:\\World of Warcraft). KoRForge rileverà automaticamente _forever_, _retail_, _classic_era_ e _classic_.',
      settings_autodetect_btn: '🔍 Rileva Client Automaticamente',
      settings_manual_card: '📦 Installazione Manuale Addon (URL / ZIP / GitHub)',
      settings_manual_desc: 'Incolla un URL di download diretto, un repository GitHub o un link zip.',
      settings_manual_btn: '⚡ Scarica e Installa',

      // Detail View
      detail_back_btn: '← Torna all’Esploratore Addon',
      detail_by: 'di',
      detail_downloads: 'Download:',
      detail_cat_ver: 'Versione catalogo:',
      detail_my_ver: 'Tua versione installata:',
      detail_updated: 'Aggiornato:',
      detail_created: 'Creato:',
      detail_repo: '📦 Repository / Codice ↗',
      detail_wiki: '📖 Wiki ufficiale ↗',
      detail_issues: '🐛 Segnala Bug ↗',
      detail_tab_desc: 'Descrizione',
      detail_tab_files: 'File e Versioni',
      detail_btn_translate_es: '🇪🇸 Traduci in spagnolo',
      detail_btn_translate_orig: '🇬🇧 Vedi originale (EN)',

      // Toasts & Alerts
      toast_backup_created: 'Backup WTF creato con successo',
      toast_backup_restored: 'Backup WTF ripristinato con successo',
      toast_addon_installed: 'Addon installato con successo',
      toast_addon_uninstalled: 'Addon disinstallato',
      toast_checking_updates: 'Ricerca aggiornamenti su CurseForge...',
      toast_no_updates: 'Tutti i tuoi addon sono aggiornati'
    }
  };

  let activeLang = 'en';

  function getLanguage() {
    return activeLang;
  }

  function t(key, defaultVal = '') {
    const langDict = TRANSLATIONS[activeLang] || TRANSLATIONS.en;
    if (langDict && langDict[key] !== undefined) {
      return langDict[key];
    }
    if (TRANSLATIONS.en && TRANSLATIONS.en[key] !== undefined) {
      return TRANSLATIONS.en[key];
    }
    return defaultVal || key;
  }

  function applyDOMTranslations() {
    document.documentElement.lang = activeLang;

    // Text content
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const trans = t(key);
        if (trans) el.textContent = trans;
      }
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const trans = t(key);
        if (trans) el.setAttribute('placeholder', trans);
      }
    });

    // Titles / Tooltips
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const trans = t(key);
        if (trans) el.setAttribute('title', trans);
      }
    });
  }

  function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) lang = 'en';
    activeLang = lang;
    try {
      localStorage.setItem('korforge_language', lang);
    } catch (_) {}

    applyDOMTranslations();

    // Dispatch event so app.js can re-render dynamic items if needed
    window.dispatchEvent(new CustomEvent('korforge:languageChanged', { detail: { lang } }));
  }

  function initLanguage(preferredLang) {
    let saved = null;
    try {
      saved = localStorage.getItem('korforge_language');
    } catch (_) {}
    const initial = saved || preferredLang || 'en';
    setLanguage(initial);
  }

  global.I18N = {
    getLanguage,
    setLanguage,
    initLanguage,
    t,
    applyDOMTranslations,
    TRANSLATIONS
  };

})(window);
