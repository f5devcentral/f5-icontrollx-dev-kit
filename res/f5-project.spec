Summary: F5 Application Services 3.0 Extension
Name: f5-serverless
Version: 0.0.1
Release: %{_release}
BuildArch: noarch
Group: Development/Tools
License: Commercial
Packager: F5 Networks <support@f5.com>

%description
F5 serverless module for calling lambda functions from BigIP REST

%define IAPP_INSTALL_DIR /var/config/rest/iapps/%{name}

%prep
mkdir -p %{_builddir}
cp -r %{main}/src/* %{_builddir}
echo -n %{version}-%{release} > %{_builddir}/version


%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp -r %{_builddir}/* $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}

%clean rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{IAPP_INSTALL_DIR}
